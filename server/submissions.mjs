import { validEventDate } from "../shared/domain/application-events.mjs";
import { parisDay } from "../shared/domain/actions-core.mjs";
const fail = (message) => {
  throw Object.assign(new Error(message), { status: 400 });
};
const id = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 200 &&
  !/[\x00-\x1f]/.test(value);
export function validateSubmission(value) {
  if (
    (value?.cvOriginalId && value?.cvVersionId) ||
    (value?.letterOmitted !== undefined &&
      typeof value.letterOmitted !== "boolean") ||
    (value?.letterOmitted && value?.letterVersionId) ||
    (value?.channel !== undefined &&
      !["form", "email", "other", "unknown"].includes(value.channel))
  )
    fail("Documents ou canal incohérents.");
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          "id",
          "applicationId",
          "occurredAt",
          "createdAt",
          "cvVersionId",
          "cvOriginalId",
          "channel",
          "letterOmitted",
          "letterVersionId",
          "note",
          "source",
          "cancelledAt",
        ].includes(key),
    ) ||
    !id(value.id) ||
    !id(value.applicationId) ||
    !validEventDate(value.occurredAt) ||
    typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    (value.cancelledAt !== undefined &&
      (typeof value.cancelledAt !== "string" ||
        !Number.isFinite(Date.parse(value.cancelledAt)))) ||
    value.source !== "manual" ||
    typeof value.note !== "string" ||
    value.note.length > 10000 ||
    value.note.includes("\0") ||
    ["cvVersionId", "cvOriginalId", "letterVersionId"].some(
      (key) => value[key] !== undefined && !id(value[key]),
    )
  )
    fail("Envoi déclaré invalide.");
}
export function validateSubmissionLinks(journey) {
  for (const submission of journey.submissions)
    for (const [key, kind] of [
      ["cvVersionId", "cv"],
      ["letterVersionId", "letter"],
    ]) {
      if (!submission[key]) continue;
      const version = journey.documentVersions.find(
          (item) => item.id === submission[key],
        ),
        document =
          version &&
          journey.documents.find((item) => item.id === version.documentId);
      if (
        !document ||
        document.kind !== kind ||
        (document.applicationId !== submission.applicationId && !(kind === "cv" && !document.applicationId))
      )
        fail("Document d’envoi incohérent.");
    }
}
export function registerSubmissionRoutes(app, db, confirmWrite) {
  const get = (table, key) => {
    const row = db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(key);
    return row && JSON.parse(row.data);
  };
  const declare = (req, res, native = false) =>
    confirmWrite(req, res, () => {
      const value = req.body;
      if (
        !value ||
        Object.keys(value).some(
          (key) =>
            ![
              "id",
              "applicationId",
              "occurredAt",
              "cvVersionId",
              "cvOriginalId",
              "channel",
              "letterOmitted",
              "letterVersionId",
              "note",
            ].includes(key),
        )
      )
        fail("Déclaration invalide.");
      const saved = {
        ...value,
        createdAt: new Date().toISOString(),
        source: "manual",
      };
      validateSubmission(saved);
      if (!get("applications", saved.applicationId))
        fail("Dossier introuvable.");
      if (get("submissions", saved.id)) fail("Déclaration déjà enregistrée.");
      if (saved.occurredAt > parisDay())
        fail("Un envoi déclaré ne peut pas être futur.");
      if (db.prepare("SELECT COUNT(*) AS n FROM submissions").get().n >= 10000)
        fail("Limite de déclarations atteinte.");
      for (const [key, kind] of [
        ["cvVersionId", "cv"],
        ["letterVersionId", "letter"],
      ])
        if (saved[key]) {
          const version = get("document_versions", saved[key]),
            document = version && get("documents", version.documentId);
          if (
            !document ||
            document.kind !== kind ||
            (document.applicationId !== saved.applicationId && !(kind === "cv" && !document.applicationId))
          )
            fail("Sélectionne une version de ce dossier.");
        }
      if (saved.cvOriginalId && !get("cv_originals", saved.cvOriginalId))
        fail("Original CV absent.");
      const application = get("applications", saved.applicationId);
      if (native && application.register && !application.registerAdoptedAt)
        fail("Adopte le dossier CSV avant de confirmer son suivi natif.");
      db.prepare("INSERT INTO submissions VALUES (?,?)").run(
        saved.id,
        JSON.stringify(saved),
      );
      if (!native) return saved;
      const updated = {
        ...application,
        status:
          application.status === "a_postuler" ? "postulee" : application.status,
        updatedAt: saved.createdAt,
        history: [
          ...application.history,
          {
            date: saved.createdAt,
            event: `Envoi confirmé (${saved.occurredAt})`,
          },
        ],
      };
      db.prepare("UPDATE applications SET data=? WHERE id=?").run(
        JSON.stringify(updated),
        updated.id,
      );
      return { submission: saved, application: updated };
    });
  app.post("/api/submissions", (req, res) => declare(req, res));
  app.post("/api/submissions/confirm", (req, res) => declare(req, res, true));
  app.post("/api/submissions/:id/cancel", (req, res) =>
    confirmWrite(req, res, () => {
      if (!req.body || Array.isArray(req.body) || Object.keys(req.body).length)
        fail("Annulation invalide.");
      const old = get("submissions", req.params.id);
      if (!old) fail("Déclaration introuvable.");
      const saved = {
        ...old,
        cancelledAt: old.cancelledAt ?? new Date().toISOString(),
      };
      validateSubmission(saved);
      db.prepare("UPDATE submissions SET data=? WHERE id=?").run(
        JSON.stringify(saved),
        saved.id,
      );
      return saved;
    }),
  );
}
