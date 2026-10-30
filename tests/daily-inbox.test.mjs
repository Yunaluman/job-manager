import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { join } from "node:path";
import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import Database from "better-sqlite3";
import { journeyFixture } from "./helpers/journey-fixture.mjs";
import { createWriteCoordinator } from "../server/writes.mjs";
import {
  importDailyBatch,
  dailySnapshot,
  createDailyInboxWorker,
  dailyIndex,
} from "../server/daily-inbox.mjs";
import {
  exportSnapshot,
  restoreSnapshot,
  validateSnapshot,
} from "../server/snapshots.mjs";
import { dashboardSummary } from "../shared/domain/dashboard.mjs";
import {
  offerUrl,
  validateDailyBatch,
} from "../shared/domain/daily-proposals.mjs";
const proposal = (patch = {}) => ({
  id: randomUUID(),
  company: "Atelier Synthétique",
  title: "Développeur React",
  location: "Paris",
  text: "Atelier Synthétique recherche un développeur React.",
  url: "https://example.test/jobs/react",
  verifiedAt: "2026-01-01T10:00:00Z",
  source: "Synthetic task",
  method: "Explicit requirements, no hiring probability",
  score: 75,
  justification: "React matches; experience remains unknown.",
  ...patch,
});
const batch = (proposals = [proposal()], patch = {}) => ({
  format: "jobpilot-daily-proposals",
  version: 1,
  id: randomUUID(),
  createdAt: "2026-01-01T12:00:00Z",
  proposals,
  ...patch,
});
const offers = (db) =>
  db
    .prepare("SELECT data FROM offers")
    .all()
    .map((r) => JSON.parse(r.data));
test("transactional replay and normalized URLs never replace human corrections or send applications", async (t) => {
  const { db, call, revision } = await journeyFixture(t),
    writes = createWriteCoordinator(db),
    input = batch();
  const first = importDailyBatch(db, writes, input);
  assert.equal(first.receipt.outcomes[0].result, "created");
  assert.equal(revision(), 1);
  assert.equal(importDailyBatch(db, writes, input).replayed, true);
  assert.equal(revision(), 1);
  assert.equal(offers(db).length, 1);
  const offer = offers(db)[0];
  assert.equal(offer.decision, "pending");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM applications").get().n, 0);
  assert.equal(
    (
      await call(`/api/offers/${offer.id}`, "PUT", {
        id: offer.id,
        company: "Human correction",
        title: offer.title,
        text: offer.text,
        url: offer.url,
        note: "reviewed",
      })
    ).status,
    200,
  );
  const duplicate = batch([
    proposal({
      url: "https://example.test/jobs/react?utm_source=daily#top",
      score: 22,
    }),
  ]);
  assert.equal(
    importDailyBatch(db, writes, duplicate).receipt.outcomes[0].result,
    "duplicate",
  );
  assert.equal(offers(db).length, 1);
  assert.equal(offers(db)[0].company, "Human correction");
  assert.equal(offers(db)[0].dailyProposal.proposal.score, 75);
  assert.throws(
    () =>
      importDailyBatch(db, writes, {
        ...input,
        proposals: [proposal({ score: 40 })],
      }),
    /Identifiant/,
  );
  const before = revision();
  db.exec(
    "CREATE TRIGGER refuse_daily BEFORE INSERT ON daily_batches BEGIN SELECT RAISE(ABORT,'synthetic failure'); END",
  );
  assert.throws(() =>
    importDailyBatch(
      db,
      writes,
      batch([
        proposal({ company: "Another", url: "https://example.test/another" }),
      ]),
    ),
  );
  assert.equal(offers(db).length, 1);
  assert.equal(revision(), before);
});
test("ambiguous matches require explicit confirmation and preparation reuses one dossier without AI", async (t) => {
  const { db, call } = await journeyFixture(t),
    writes = createWriteCoordinator(db);
  const first = importDailyBatch(db, writes, batch()).receipt,
    offerId = first.outcomes[0].offerId;
  const ambiguous = importDailyBatch(
    db,
    writes,
    batch([proposal({ url: "https://example.test/new" })]),
  ).receipt;
  assert.equal(ambiguous.outcomes[0].result, "review");
  assert.equal(offers(db).length, 1);
  assert.equal(
    (
      await call(`/api/daily-inbox/${ambiguous.id}/resolve`, "POST", {
        proposalId: ambiguous.batch.proposals[0].id,
        choice: "offer:missing",
      })
    ).status,
    400,
  );
  const headers = {
      "X-JobPilot-Revision": String(writes.revision()),
      "X-JobPilot-Operation": randomUUID(),
    },
    body = {
      proposalId: ambiguous.batch.proposals[0].id,
      choice: `offer:${offerId}`,
    };
  const confirmed = await call(
    `/api/daily-inbox/${ambiguous.id}/resolve`,
    "POST",
    body,
    headers,
  );
  assert.equal(confirmed.status, 200);
  assert.equal(offers(db).length, 1);
  assert.deepEqual(
    (
      await call(
        `/api/daily-inbox/${ambiguous.id}/resolve`,
        "POST",
        body,
        headers,
      )
    ).body,
    confirmed.body,
  );
  const go = await call(`/api/offers/${offerId}/decision`, "POST", {
      decision: "go",
      reason: "",
    }),
    again = await call(`/api/offers/${offerId}/decision`, "POST", {
      decision: "go",
      reason: "",
    });
  assert.equal(go.body.result.application.id, again.body.result.application.id);
  assert.equal(go.body.result.application.location, "Paris");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM submissions").get().n, 0);
});
test("startup, periodic ingestion, rejected bytes and stopped-worker restart preserve provenance", async (t) => {
  const { db, directory } = await journeyFixture(t),
    writes = createWriteCoordinator(db),
    pending = join(directory, "daily-inbox", "pending");
  await mkdir(pending, { recursive: true });
  await writeFile(join(pending, "waiting.json"), JSON.stringify(batch()));
  const worker = createDailyInboxWorker({
    db,
    writes,
    dataDirectory: directory,
    intervalMs: 20,
  });
  t.after(() => worker.stop());
  await worker.start();
  assert.equal(offers(db).length, 1);
  await writeFile(join(pending, "broken.json"), "invalid JSON");
  await writeFile(
    join(pending, "later.json"),
    JSON.stringify(
      batch([
        proposal({ company: "Later", url: "https://example.test/later" }),
      ]),
    ),
  );
  const deadline = Date.now() + 3000;
  while (offers(db).length < 2 && Date.now() < deadline)
    await new Promise((r) => setTimeout(r, 20));
  await worker.scan();
  assert.equal(offers(db).length, 2);
  const rejected = await readdir(join(directory, "daily-inbox", "rejected"));
  assert.ok(rejected.some((n) => n.endsWith("broken.json.error.json")));
  assert.equal(
    await readFile(
      join(
        directory,
        "daily-inbox",
        "rejected",
        rejected.find((n) => n.endsWith("broken.json")),
      ),
      "utf8",
    ),
    "invalid JSON",
  );
  const index = JSON.parse(
    await readFile(join(directory, "daily-inbox", "known-offers.json"), "utf8"),
  );
  assert.equal(index.entries.length, 2);
  assert.equal(JSON.stringify(index).includes("cvText"), false);
  await worker.stop();
  await writeFile(
    join(pending, "restart.json"),
    JSON.stringify(
      batch([
        proposal({ company: "Restart", url: "https://example.test/restart" }),
      ]),
    ),
  );
  await worker.scan();
  assert.equal(offers(db).length, 2);
  const restarted = createDailyInboxWorker({
    db,
    writes,
    dataDirectory: directory,
  });
  t.after(() => restarted.stop());
  await restarted.start();
  assert.equal(offers(db).length, 3);
  await restarted.stop();
});
test("invalid and oversized batches cannot partially import; incomplete downloads wait for atomic rename", async (t) => {
  const { db, directory } = await journeyFixture(t),
    writes = createWriteCoordinator(db),
    worker = createDailyInboxWorker({ db, writes, dataDirectory: directory });
  t.after(() => worker.stop());
  for (const p of [
    proposal({ score: 101 }),
    proposal({ justification: "" }),
    proposal({ url: "http://127.0.0.1/test" }),
    proposal({ verifiedAt: "2026-02-01T00:00:00Z" }),
  ])
    assert.throws(() => validateDailyBatch(batch([p])));
  assert.throws(() =>
    importDailyBatch(db, writes, batch([proposal(), proposal({ text: "" })])),
  );
  assert.equal(offers(db).length, 0);
  await worker.scan();
  const pending = join(directory, "daily-inbox", "pending");
  await writeFile(join(pending, "partial.json.tmp"), "{");
  await writeFile(
    join(pending, "oversized.json"),
    " ".repeat(2 * 1024 * 1024 + 1),
  );
  await worker.scan();
  assert.equal(offers(db).length, 0);
  assert.ok((await readdir(pending)).includes("partial.json.tmp"));
  assert.equal(
    offerUrl("https://example.test/offer?utm_campaign=a&job=5#x"),
    "https://example.test/offer?job=5",
  );
});
test("portable v7 restores receipt replay and sources; older and tampered backups refuse loss", async (t) => {
  const { db, directory } = await journeyFixture(t),
    writes = createWriteCoordinator(db),
    input = batch();
  importDailyBatch(db, writes, input);
  assert.throws(() => exportSnapshot(db, {}, 6), /v7/);
  const snapshot = exportSnapshot(db, {}),
    path = join(directory, "restored.db");
  restoreSnapshot(snapshot, path);
  const restored = new Database(path);
  try {
    assert.deepEqual(dailySnapshot(restored), dailySnapshot(db));
    assert.equal(
      importDailyBatch(restored, createWriteCoordinator(restored), input)
        .replayed,
      true,
    );
  } finally {
    restored.close();
  }
  const bad = structuredClone(snapshot);
  bad.payload.dailyInbox = [];
  bad.checksum = createHash("sha256")
    .update(JSON.stringify(bad.payload))
    .digest("hex");
  assert.throws(() => validateSnapshot(bad), /Provenance/);
});
test("dashboard period affects dated sends only; unknowns, preparation and planned interviews stay distinct", () => {
  const day = "2026-10-13",
    app = (id, status, events, extra = {}) => ({
      id,
      status,
      company: id,
      title: "Dev",
      history: [],
      events,
      ...extra,
    });
  const applications = [
    app("prep", "a_postuler", []),
    app("unknown", "postulee", []),
    app("recent", "postulee", [{ kind: "sent", occurredAt: day }], {
      nextActionAt: day,
    }),
    app("old", "postulee", [{ kind: "sent", occurredAt: "2026-09-10" }]),
    app("answered", "postulee", [
      { kind: "sent", occurredAt: day },
      { kind: "response", occurredAt: day },
    ]),
  ];
  const state = {
    applications,
    actions: [],
    journey: { offers: [], submissions: [] },
    interviewPlans: [
      {
        id: "planned",
        applicationId: "recent",
        status: "planned",
        scheduledDate: day,
        title: "Announced",
      },
      {
        id: "closed",
        applicationId: "answered",
        status: "closed",
        scheduledDate: day,
      },
      {
        id: "past",
        applicationId: "old",
        status: "planned",
        scheduledDate: "2026-10-01",
      },
    ],
  };
  const result = dashboardSummary(state, day);
  assert.equal(result.sent, 2);
  assert.equal(result.waiting, 2);
  assert.equal(result.interviews, 1);
  assert.equal(result.followups, 1);
  assert.equal(result.preparation.length, 1);
  assert.equal(result.preparation[0].id, "prep");
  assert.equal(result.unknownHistory, 5);
  const longer = dashboardSummary(state, day, 90);
  assert.equal(longer.sent, 3);
  assert.equal(longer.waiting, result.waiting);
  assert.equal(longer.interviews, result.interviews);
  state.journey.submissions = [
    { id: "original-only", applicationId: "prep", occurredAt: day },
  ];
  assert.equal(dashboardSummary(state, day).sent, 3);
});
test("an unavailable inbox does not prevent manual work or leak filesystem errors", async (t) => {
  const { db, directory, call } = await journeyFixture(t),
    writes = createWriteCoordinator(db);
  await writeFile(join(directory, "daily-inbox"), "synthetic conflicting file");
  const worker = createDailyInboxWorker({
    db,
    writes,
    dataDirectory: directory,
  });
  await worker.start();
  try {
    assert.match(worker.status().error, /indisponible/);
    assert.equal(worker.status().checkedAt, null);
    assert.equal(worker.status().error.includes(directory), false);
    assert.equal((await call("/api/state")).status, 200);
  } finally {
    await worker.stop();
  }
});
