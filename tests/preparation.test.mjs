import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import Database from "better-sqlite3";
import mammoth from "mammoth";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { journeyFixture } from "./helpers/journey-fixture.mjs";
import { exportSnapshot, restoreSnapshot } from "../server/snapshots.mjs";
const input = (applicationId) => ({
  kind: "letter",
  applicationId,
  title: "Lettre synthétique",
  status: "draft",
  content: {
    sender: "Alex Martin",
    recipient: "Équipe fictive",
    placeDate: "Paris",
    subject: "Candidature",
    greeting: "Bonjour,",
    body: "Compétences vérifiées : React.\nExpérience étudiée. FIN ÉTÉ",
    closing: "Cordialement,",
    signature: "Alex Martin",
  },
  layout: { fontSize: 11, marginMm: 20, hidden: [] },
  sources: {},
});
async function setup(call) {
  const app = {
    id: "synthetic",
    company: "Fictive",
    title: "React",
    status: "a_postuler",
    history: [],
    events: [],
  };
  assert.equal(
    (await call("/api/applications/synthetic", "PUT", app)).status,
    200,
  );
  return app;
}
test("draft PDF/DOCX rendering preserves corrected text without writes or sent events", async (t) => {
  const { call, db, revision } = await journeyFixture(t),
    app = await setup(call),
    draft = input(app.id),
    before = revision();
  assert.equal(
    (
      await call(
        "/api/documents/preview",
        "POST",
        { input: draft, format: "pdf" },
        { "X-JobPilot-Session": "" },
      )
    ).status,
    401,
  );
  for (const format of ["exe", "pdf"])
    assert.equal(
      (
        await call("/api/documents/preview", "POST", {
          input:
            format === "pdf"
              ? { ...draft, content: { ...draft.content, body: "" } }
              : draft,
          format,
        })
      ).status,
      400,
    );
  const pdf = await call("/api/documents/preview", "POST", {
    input: draft,
    format: "pdf",
  });
  assert.equal(pdf.status, 200);
  const task = getDocument({
      data: new Uint8Array(pdf.body),
      useSystemFonts: false,
    }),
    doc = await task.promise;
  try {
    assert.match(
      (await (await doc.getPage(1)).getTextContent()).items
        .map((item) => item.str ?? "")
        .join(" "),
      /FIN ÉTÉ/,
    );
  } finally {
    await task.destroy();
  }
  const word = await call("/api/documents/preview", "POST", {
    input: draft,
    format: "docx",
  });
  assert.equal(word.status, 200);
  assert.match(
    (await mammoth.extractRawText({ buffer: word.body })).value,
    /Compétences vérifiées/,
  );
  assert.equal(revision(), before);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM document_versions").get().n,
    0,
  );
  assert.deepEqual((await call("/api/state")).body.applications[0].events, []);
});
test("letter original references validate exact text, remain immutable and survive v7 restore", async (t) => {
  const { call, db, directory } = await journeyFixture(t),
    app = await setup(call),
    id = randomUUID(),
    text = "Alex Martin\nReact engineer";
  assert.equal(
    (
      await call("/api/cv-originals", "POST", {
        id,
        name: "synthetic.txt",
        bytes: Buffer.from(text).toString("base64"),
      })
    ).status,
    200,
  );
  const draft = input(app.id);
  draft.sources = {
    originalId: id,
    cvText: text,
    offerText: "React",
    generationMode: "api",
    generationModel: "synthetic-model",
    generationProvider: "mistral",
  };
  for (const sources of [
    { ...draft.sources, cvText: "invented" },
    { ...draft.sources, originalId: "missing" },
    { ...draft.sources, cvVersionId: "other" },
    { ...draft.sources, generationProvider: "secret" },
  ]) {
    assert.equal(
      (
        await call("/api/documents/preview", "POST", {
          input: { ...draft, sources },
          format: "pdf",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call("/api/documents/letter/versions", "POST", {
          ...draft,
          sources,
        })
      ).status,
      400,
    );
  }
  const first = await call("/api/documents/letter/versions", "POST", draft);
  assert.equal(first.status, 200);
  const second = await call("/api/documents/letter/versions", "POST", {
    ...draft,
    parentVersionId: first.body.result.version.id,
    content: { ...draft.content, body: "Correction humaine" },
  });
  assert.equal(second.status, 200);
  assert.equal(
    JSON.parse(
      db
        .prepare("SELECT data FROM document_versions WHERE id=?")
        .get(first.body.result.version.id).data,
    ).content.body,
    draft.content.body,
  );
  assert.throws(() => exportSnapshot(db, {}, 6), /v7/);
  const path = join(directory, "roundtrip.db");
  restoreSnapshot(exportSnapshot(db, {}), path);
  const restored = new Database(path);
  try {
    const saved = JSON.parse(
      restored
        .prepare("SELECT data FROM document_versions WHERE id=?")
        .get(first.body.result.version.id).data,
    );
    assert.deepEqual(saved.sources, draft.sources);
  } finally {
    restored.close();
  }
});
