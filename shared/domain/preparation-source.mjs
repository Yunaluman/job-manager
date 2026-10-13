export function resolvePreparationCv(application, journey, originals) {
  if (application.preparationCv) return application.preparationCv;
  const documents = journey.documents.filter(
    (item) => item.applicationId === application.id && item.kind === "letter",
  );
  const latest = journey.documentVersions
    .filter((item) => documents.some((doc) => doc.id === item.documentId))
    .sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt) || b.number - a.number,
    )[0];
  if (latest?.sources.cvVersionId)
    return { kind: "version", id: latest.sources.cvVersionId };
  if (latest?.sources.originalId)
    return { kind: "original", id: latest.sources.originalId };
  if (latest) return { kind: "profile", id: "profile" };
  const original = originals
    .filter((item) => item.format === "pdf")
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
    )[0];
  return original
    ? { kind: "original", id: original.id }
    : { kind: "profile", id: "profile" };
}
