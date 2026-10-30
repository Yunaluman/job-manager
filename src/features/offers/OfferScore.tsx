import type {
  Offer,
  Qualification,
} from "../../../shared/contracts/journey-types";
export function OfferScore({
  offer,
  qualifications,
}: {
  offer: Offer;
  qualifications: Qualification[];
}) {
  const confirmed = [...qualifications]
    .filter((q) => q.offerId === offer.id && q.summary)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const daily = offer.dailyProposal?.proposal;
  return (
    <div className="text-xs text-muted">
      {confirmed && (
        <p>
          {confirmed.offerText === offer.text
            ? "Évaluation confirmée"
            : "Évaluation historique (ancienne annonce)"}{" "}
          :{" "}
          <strong className="text-ink">
            {confirmed.summary!.score === null
              ? "Score inconnu"
              : `${confirmed.summary!.score}/100`}
          </strong>
        </p>
      )}
      {daily ? (
        <details className="mt-1">
          <summary className="cursor-pointer">
            Veille :{" "}
            <strong className="text-ink">
              {daily.score === null ? "Score inconnu" : `${daily.score}/100`}
            </strong>{" "}
            · {new Date(daily.verifiedAt).toLocaleDateString("fr-FR")}
          </summary>
          <p className="mt-2 whitespace-pre-wrap break-words">
            {daily.justification}
          </p>
          <p className="mt-1 break-words">
            {daily.source} · {daily.method}
          </p>
          <p className="mt-1">Score externe, à vérifier dans JobPilot.</p>
        </details>
      ) : (
        !confirmed && <p>Pas encore évaluée</p>
      )}
    </div>
  );
}
