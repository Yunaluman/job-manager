import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { join } from "node:path";
import Database from "better-sqlite3";
import { journeyFixture } from "./helpers/journey-fixture.mjs";
import { row, csvFor, columns } from "./helpers/register-fixtures.mjs";
import {
  exportSnapshot,
  restoreSnapshot,
  validateSnapshot,
} from "../server/snapshots.mjs";
import { parseRegisterCsv } from "../server/register-csv.mjs";
import { resolvePreparationCv } from "../shared/domain/preparation-source.mjs";
import { funnelMetrics } from "../shared/domain/application-events.mjs";
test("a follow-up is not an employer response", () => {
  const metrics = funnelMetrics([{id:'followed',events:[{id:'sent',kind:'sent',occurredAt:'2026-01-01',source:'manual'},{id:'followup',kind:'followup',occurredAt:'2026-01-05',source:'manual'}]}]);
  assert.equal(metrics.responses,0);
  assert.equal(metrics.responseRate,0);
});
async function imported(call) {
  const csv = csvFor(
    [
      row({
        statut: "postule",
        date_candidature: "",
        date_reponse: "",
        notes: "source initiale",
        verification_source: "preuve conservée",
      }),
    ],
    [...columns,"verification_source"],
  );
  const saved = await call("/api/register/import", "POST", {
    csv,
    sourceName: "synthetic.csv",
    resolutions: [{ rowKey: "1", targetId: null }],
  });
  assert.equal(saved.status, 200);
  return { app: saved.body.result.applications[0], csv };
}
const appInput = {
  id: "native",
  company: "Fixture",
  title: "React",
  status: "a_postuler",
  events: [],
  history: [],
  createdAt: "2026-01-01T12:00:00Z",
  updatedAt: "2026-01-01T12:00:00Z",
};
async function original(call, text = "React synthetic source") {
  const id = randomUUID();
  assert.equal(
    (
      await call("/api/cv-originals", "POST", {
        id,
        name: "cv.txt",
        bytes: Buffer.from(text).toString("base64"),
      })
    ).status,
    200,
  );
  return id;
}
test("adoption retains exact provenance, no invented sends; stale/replayed writes and later CSV conflicts are safe", async (t) => {
  const { call, db, revision } = await journeyFixture(t),
    { app, csv } = await imported(call),
    before = revision();
  assert.equal(
    (
      await call(
        "/api/register/adopt",
        "POST",
        { ids: [app.id] },
        { "X-JobPilot-Revision": String(before - 1) },
      )
    ).status,
    409,
  );
  const headers = {
      "X-JobPilot-Operation": randomUUID(),
      "X-JobPilot-Revision": String(before),
    },
    first = await call(
      "/api/register/adopt",
      "POST",
      { ids: [app.id] },
      headers,
    );
  assert.equal(first.status, 200);
  assert.deepEqual(
    (await call("/api/register/adopt", "POST", { ids: [app.id] }, headers))
      .body,
    first.body,
  );
  const native = first.body.result.applications[0];
  assert.deepEqual(native.events, []);
  assert.deepEqual(native.register, app.register);
  assert.equal(native.externalId, app.externalId);
  const corrected = {
    ...native,
    company: "Correction humaine",
    notes: "Nouvelle note",
  };
  assert.equal(
    (await call(`/api/applications/${app.id}`, "PUT", corrected)).status,
    200,
  );
  assert.equal(
    (
      await call(`/api/applications/${app.id}`, "PUT", {
        ...corrected,
        register: { ...corrected.register, sourceName: "forged" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/api/register/import", "POST", {
        csv,
        sourceName: "later.csv",
        resolutions: [{ rowKey: "1", targetId: app.id }],
      })
    ).status,
    400,
  );
  const exported = parseRegisterCsv(
    (await call("/api/register/export")).body.toString("utf8"),
  )[0];
  assert.equal(exported.id, app.externalId);
  assert.equal(exported.entreprise, "Correction humaine");
  assert.equal(exported.date_candidature, "");
  assert.equal(exported.verification_source, "preuve conservée");
  assert.equal(exported.fichier_cv, app.register.raw.fichier_cv);
  assert.throws(() => exportSnapshot(db, {}, 6), /v7/);
});
test("preparation selection persists independently and validates actual references", async (t) => {
  const { call } = await journeyFixture(t);
  await call("/api/applications/native", "PUT", appInput);
  const id = await original(call);
  for (const cv of [
    { kind: "original", id: "missing" },
    { kind: "profile", id: "forged" },
    { kind: "version", id: "missing" },
    { kind: "original", id, extra: true },
  ])
    assert.equal(
      (await call("/api/applications/native/preparation", "PUT", { cv }))
        .status,
      400,
    );
  assert.equal(
    (
      await call("/api/applications/native/preparation", "PUT", {
        cv: { kind: "original", id },
      })
    ).status,
    200,
  );
  assert.deepEqual(
    (await call("/api/state")).body.applications[0].preparationCv,
    { kind: "original", id },
  );
  assert.equal(
    (await call("/api/applications/native/preparation", "PUT", { cv: null }))
      .status,
    200,
  );
  assert.deepEqual(
    (await call("/api/state")).body.applications[0].preparationCv,
    { kind: "profile", id: "profile" },
  );
  const journey = { documents: [], documentVersions: [] };
  assert.deepEqual(
    resolvePreparationCv(appInput, journey, [
      { id: "pdf", format: "pdf", createdAt: "2026-01-01" },
    ]),
    { kind: "original", id: "pdf" },
  );
  assert.deepEqual(
    resolvePreparationCv(
      { ...appInput, preparationCv: { kind: "profile", id: "profile" } },
      journey,
      [{ id: "pdf", format: "pdf", createdAt: "2026-01-01" }],
    ),
    { kind: "profile", id: "profile" },
  );
});
test("human confirmation accepts original CV without letter, replays once and preserves immutable references", async (t) => {
  const { call, revision, db, directory } = await journeyFixture(t);
  await call("/api/applications/native", "PUT", appInput);
  const cvOriginalId = await original(call),
    before = revision(),
    input = {
      id: randomUUID(),
      applicationId: "native",
      occurredAt: "2026-01-02",
      cvOriginalId,
      channel: "form",
      letterOmitted: true,
      note: "",
    };
  const headers = {
      "X-JobPilot-Revision": String(before),
      "X-JobPilot-Operation": randomUUID(),
    },
    saved = await call("/api/submissions/confirm", "POST", input, headers);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.result.application.status, "postulee");
  assert.deepEqual(saved.body.result.application.events, []);
  assert.deepEqual(
    (await call("/api/submissions/confirm", "POST", input, headers)).body,
    saved.body,
  );
  await original(call, "New replacement source");
  assert.equal(
    (await call("/api/state")).body.journey.submissions[0].cvOriginalId,
    cvOriginalId,
  );
  for (const patch of [
    { cvOriginalId: "missing" },
    { cvVersionId: "other" },
    { channel: "forged" },
    { letterOmitted: "true" },
    { letterVersionId: "other" },
  ])
    assert.equal(
      (
        await call("/api/submissions/confirm", "POST", {
          ...input,
          id: randomUUID(),
          ...patch,
        })
      ).status,
      400,
    );
  const snapshot = exportSnapshot(db, {}),
    path = join(directory, "native-v7.db");
  restoreSnapshot(snapshot, path);
  const restored = new Database(path);
  try {
    assert.equal(
      JSON.parse(restored.prepare("SELECT data FROM submissions").get().data)
        .cvOriginalId,
      cvOriginalId,
    );
  } finally {
    restored.close();
  }
  assert.throws(() => exportSnapshot(db, {}, 6), /v7/);
  const bad = structuredClone(snapshot);
  bad.payload.cvOriginals = [];
  bad.checksum = createHash("sha256")
    .update(JSON.stringify(bad.payload))
    .digest("hex");
  assert.throws(() => validateSnapshot(bad));
});
test("failed confirmation rolls back both submission and status; imported source dates cannot be changed", async (t) => {
  const { call, db, revision } = await journeyFixture(t);
  await call("/api/applications/native", "PUT", appInput);
  const before = revision();
  db.exec(
    "CREATE TRIGGER refuse_native BEFORE UPDATE ON applications BEGIN SELECT RAISE(ABORT,'synthetic failure'); END",
  );
  assert.equal(
    (
      await call("/api/submissions/confirm", "POST", {
        id: randomUUID(),
        applicationId: "native",
        occurredAt: "2026-01-02",
        channel: "unknown",
        note: "",
      })
    ).status,
    500,
  );
  assert.equal(revision(), before);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM submissions").get().n, 0);
  db.exec("DROP TRIGGER refuse_native");
  const csv = csvFor([row()]);
  const imported = (
    await call("/api/register/import", "POST", {
      csv,
      sourceName: "dates.csv",
      resolutions: [{ rowKey: "1", targetId: null }],
    })
  ).body.result.applications.find((item) => item.register);
  await call("/api/register/adopt", "POST", { ids: [imported.id] });
  const native = (await call("/api/state")).body.applications.find(
    (item) => item.id === imported.id,
  );
  const tampered = exportSnapshot(db, {});
  tampered.payload.applications.find(item=>item.id===native.id).events=[];
  tampered.checksum=createHash('sha256').update(JSON.stringify(tampered.payload)).digest('hex');
  assert.throws(()=>validateSnapshot(tampered),/Archive native invalide/);
  assert.equal(
    (
      await call(`/api/applications/${native.id}`, "PUT", {
        ...native,
        events: [],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(`/api/applications/${native.id}`, "PUT", {
        ...native,
        events: [
          ...native.events,
          {
            id: "response-human",
            kind: "followup",
            occurredAt: "2026-01-10",
            source: "manual",
          },
        ],
      })
    ).status,
    200,
  );
});
