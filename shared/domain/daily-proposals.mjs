const object = (v) => v && typeof v === "object" && !Array.isArray(v);
const text = (v, max) =>
  typeof v === "string" &&
  !!v.trim() &&
  v.length <= max &&
  !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v);
const exact = (v, keys) =>
  object(v) && Object.keys(v).every((k) => keys.includes(k));
const timestamp = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d\d-\d\dT/.test(v) &&
  Number.isFinite(Date.parse(v));
const fail = () => {
  throw new Error(
    "Lot de propositions invalide : vérifie le format, les sources et les scores.",
  );
};
export function offerUrl(value) {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      !url.hostname.includes(".") ||
      /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
        url.hostname,
      ) ||
      url.hostname.endsWith(".local")
    )
      return "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()])
      if (/^utm_/i.test(key) || ["gclid", "fbclid"].includes(key))
        url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}
export function validateDailyProposal(p) {
  if (
    !exact(p, [
      "id",
      "company",
      "title",
      "location",
      "text",
      "url",
      "verifiedAt",
      "source",
      "method",
      "score",
      "justification",
    ]) ||
    !text(p.id, 200) ||
    !text(p.company, 300) ||
    !text(p.title, 300) ||
    typeof p.location !== "string" ||
    p.location.length > 300 ||
    !text(p.text, 100000) ||
    !text(p.url, 2000) ||
    !offerUrl(p.url) ||
    !timestamp(p.verifiedAt) ||
    !text(p.source, 300) ||
    !text(p.method, 1000) ||
    !(
      p.score === null ||
      (Number.isInteger(p.score) && p.score >= 0 && p.score <= 100)
    ) ||
    !text(p.justification, 10000)
  )
    fail();
}
export function validateDailyBatch(batch) {
  if (
    !exact(batch, ["format", "version", "id", "createdAt", "proposals"]) ||
    batch.format !== "jobpilot-daily-proposals" ||
    batch.version !== 1 ||
    !text(batch.id, 200) ||
    !timestamp(batch.createdAt) ||
    !Array.isArray(batch.proposals) ||
    !batch.proposals.length ||
    batch.proposals.length > 100 ||
    new Set(batch.proposals.map((p) => p?.id)).size !== batch.proposals.length
  )
    fail();
  batch.proposals.forEach(validateDailyProposal);
  if (
    batch.proposals.some(
      (p) => Date.parse(p.verifiedAt) > Date.parse(batch.createdAt),
    )
  )
    fail();
}
export function validateDailyProvenance(p) {
  if (
    !exact(p, ["batchId", "receivedAt", "proposal"]) ||
    !text(p.batchId, 200) ||
    !timestamp(p.receivedAt)
  )
    fail();
  validateDailyProposal(p.proposal);
}
const identity = (p) =>
  `${p.company.trim().normalize("NFKC").toLowerCase()}|${p.title.trim().normalize("NFKC").toLowerCase()}`;
export function matchDailyProposal(proposal, offers, applications) {
  const candidates = [
    ...offers.map((p) => ({ key: `offer:${p.id}`, value: p })),
    ...applications.map((p) => ({ key: `application:${p.id}`, value: p })),
  ];
  const exact = candidates.filter(
    (p) => offerUrl(p.value.url) === offerUrl(proposal.url),
  );
  if (exact.length === 1)
    return { result: "duplicate", candidates: exact.map((p) => p.key) };
  const ambiguous = exact.length
    ? exact
    : candidates.filter((p) => identity(p.value) === identity(proposal));
  return {
    result: ambiguous.length ? "review" : "created",
    candidates: ambiguous.map((p) => p.key),
  };
}
