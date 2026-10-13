import { createHash } from "node:crypto";
import { validateRegisterProjection } from "./register-csv.mjs";
import {
  validateApplicationEvents,
  applicationEvents,
  firstSendDate,
} from "../shared/domain/application-events.mjs";
import { withDeclaredSends } from "../shared/domain/journey-progress.mjs";
const fail = (message) => {
  throw Object.assign(new Error(message), { status: 400 });
};
export function validatePreparation(application, originals, journey) {
  const value = application.preparationCv;
  if (!value) return;
  if (value.kind === "profile") {
    if (value.id !== "profile") fail("Source texte invalide.");
    return;
  }
  if (value.kind === "original") {
    if (!originals.some((original) => original.id === value.id))
      fail("Original sélectionné absent.");
    return;
  }
  const version = journey.documentVersions.find((item) => item.id === value.id),
    doc =
      version &&
      journey.documents.find((item) => item.id === version.documentId);
  if (
    !doc ||
    doc.kind !== "cv" ||
    (doc.applicationId && doc.applicationId !== application.id)
  )
    fail("Version sélectionnée incompatible.");
}
export function registerNativeRoutes(app, db, confirmWrite, backup) {
  const rows = () =>
    db
      .prepare("SELECT data FROM applications")
      .all()
      .map((row) => JSON.parse(row.data));
  app.post("/api/register/adopt", async (req, res, next) => {
    try {
      if (
        !req.body ||
        Object.keys(req.body).some((key) => key !== "ids") ||
        !Array.isArray(req.body.ids) ||
        !req.body.ids.length ||
        req.body.ids.length > 5000 ||
        new Set(req.body.ids).size !== req.body.ids.length ||
        req.body.ids.some((id) => typeof id !== "string" || !id)
      )
        fail("Sélection invalide.");
      // Preflight prevents repeating a backup for a replayed receipt.
      const replay = backup.preflight(req);
      if (replay) return res.json(replay);
      const applications = rows(),
        selected = req.body.ids.map((id) =>
          applications.find((item) => item.id === id),
        );
      if (selected.some((item) => !item?.register || item.registerAdoptedAt))
        fail("Sélectionne des copies CSV non adoptées.");
      selected.forEach(validateRegisterProjection);
      await backup.run();
      confirmWrite(req, res, () => {
        const now = new Date().toISOString(),
          adopted = selected.map((item) => ({
            ...item,
            registerAdoptedAt: now,
            updatedAt: now,
            history: [
              ...item.history,
              { date: now, event: "Suivi principal adopté dans JobPilot" },
            ],
          }));
        for (const item of adopted) {
          validateRegisterProjection(item);
          validateApplicationEvents(item);
          db.prepare("UPDATE applications SET data=? WHERE id=?").run(
            JSON.stringify(item),
            item.id,
          );
        }
        return {
          applications: rows(),
          adopted: adopted.length,
          backupVerified: true,
        };
      });
    } catch (error) {
      next(error);
    }
  });
}
const columns = [
  "id",
  "entreprise",
  "intitule_poste",
  "localisation",
  "source",
  "url",
  "date_candidature",
  "statut",
  "date_relance",
  "date_reponse",
  "resultat",
  "fichier_cv",
  "fichier_lm",
  "notes",
];
const statuses = {
  a_postuler: "a_preparer",
  postulee: "postule",
  relancee: "relance",
  entretien: "entretien",
  offre: "offre",
  refusee: "refus",
};
export function exportRegisterCsv(applications, journey, originals) {
  const headers = [
    ...new Set([
      ...applications.flatMap((app) => Object.keys(app.register?.raw ?? {})),
      ...columns,
      "date_entretien",
      "date_offre",
      "date_refus",
    ]),
  ];
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const records = applications.map((app) => {
    if (app.register && !app.registerAdoptedAt) return app.register.raw;
    const events = applicationEvents(
        withDeclaredSends(app, journey.submissions),
      ),
      latest = (kind) =>
        events
          .filter((event) => event.kind === kind)
          .map((event) => event.occurredAt)
          .sort()
          .at(-1) ?? "";
    const sent = journey.submissions
      .filter((item) => item.applicationId === app.id && !item.cancelledAt)
      .sort(
        (a, b) =>
          b.occurredAt.localeCompare(a.occurredAt) ||
          b.createdAt.localeCompare(a.createdAt),
      )[0];
    const original = originals.find((item) => item.id === sent?.cvOriginalId);
    return {
      ...app.register?.raw,
      id:
        app.externalId ??
        `${new Date(app.createdAt).getFullYear() || 2026}-${BigInt("0x" + createHash("sha256").update(app.id).digest("hex").slice(0, 16))}`,
      entreprise: app.company,
      intitule_poste: app.title,
      localisation: app.location ?? "",
      source: app.source ?? "",
      url: app.url ?? "",
      date_candidature:
        firstSendDate(withDeclaredSends(app, journey.submissions)) ?? "",
      statut: statuses[app.status] ?? "",
      date_relance: app.nextActionAt ?? "",
      date_reponse: latest("response"),
      date_entretien: latest("interview"),
      date_offre: latest("offer"),
      date_refus: latest("refusal"),
      resultat: app.register?.raw.resultat ?? "",
      fichier_cv: sent
        ? (original?.name ?? "")
        : (app.register?.raw.fichier_cv ?? ""),
      fichier_lm: sent ? "" : (app.register?.raw.fichier_lm ?? ""),
      notes: app.notes ?? "",
    };
  });
  return (
    "\uFEFF" +
    [
      headers.map(quote).join(";"),
      ...records.map((row) => headers.map((key) => quote(row[key])).join(";")),
    ].join("\r\n") +
    "\r\n"
  );
}
export function hasNativeData(applications, journey) {
  return (
    applications.some(
      (app) =>
        app.registerAdoptedAt !== undefined ||
        app.preparationCv !== undefined ||
        app.events?.some((event) => event.kind === "followup"),
    ) ||
    journey.submissions.some(
      (value) =>
        value.cvOriginalId !== undefined ||
        value.channel !== undefined ||
        value.letterOmitted !== undefined,
    )
  );
}
