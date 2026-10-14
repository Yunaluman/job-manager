import { useState } from "react";
import { useData, dataStore } from "../../data";
import type { DailyReceipt } from "../../../shared/contracts/daily-types";
import type { Offer } from "../../../shared/contracts/journey-types";
import { WriteForm } from "../../components/WriteForm";
export function DailyReviews() {
  const { dailyInbox, applications, journey } = useData();
  const pending = dailyInbox.flatMap((receipt) =>
    receipt.outcomes
      .filter((o) => o.result === "review")
      .map((outcome) => ({
        receipt,
        outcome,
        proposal: receipt.batch.proposals.find(
          (p) => p.id === outcome.proposalId,
        )!,
      })),
  );
  if (!pending.length) return null;
  return (
    <section className="app-panel p-5" aria-label="Rapprochements de veille">
      <h2 className="font-semibold">
        Rapprochements à vérifier ({pending.length})
      </h2>
      <p className="mt-1 text-sm text-muted">
        Aucune correction existante n’est remplacée.
      </p>
      <div className="mt-3 space-y-4">
        {pending.map(({ receipt, outcome, proposal }) => (
          <Review
            key={`${receipt.id}:${proposal.id}`}
            receipt={receipt}
            proposalId={proposal.id}
            company={proposal.company}
            title={proposal.title}
            candidates={outcome.candidates.map((key) => {
              const separator = key.indexOf(":");
              const item = key.startsWith("offer:")
                ? journey.offers.find((o) => o.id === key.slice(separator + 1))
                : applications.find((a) => a.id === key.slice(separator + 1));
              return {
                key,
                label: item
                  ? `${item.company} — ${item.title}`
                  : "Référence supprimée",
              };
            })}
          />
        ))}
      </div>
    </section>
  );
}
function Review({
  receipt,
  proposalId,
  company,
  title,
  candidates,
}: {
  receipt: DailyReceipt;
  proposalId: string;
  company: string;
  title: string;
  candidates: { key: string; label: string }[];
}) {
  const [choice, setChoice] = useState("");
  return (
    <div className="border-t border-line pt-3">
      <p className="mb-2 text-sm font-medium break-words">
        {company} — {title}
      </p>
      <WriteForm
        dirty={!!choice}
        canSubmit={!!choice}
        label="Confirmer le rapprochement"
        save={() =>
          dataStore.mutate<{ dailyInbox: DailyReceipt[]; offers: Offer[] }>(
            () => ({
              method: "POST",
              path: `daily-inbox/${encodeURIComponent(receipt.id)}/resolve`,
              body: { proposalId, choice },
              apply: (state, result) => ({
                ...state,
                dailyInbox: result.dailyInbox,
                journey: { ...state.journey, offers: result.offers },
              }),
            }),
          )
        }
      >
        <select
          aria-label={`Rapprocher ${title}`}
          value={choice}
          className="app-field"
          onChange={(e) => setChoice(e.target.value)}
        >
          <option value="">Choisir après vérification</option>
          {candidates.map((c) => (
            <option key={c.key} value={c.key}>
              Même offre : {c.label}
            </option>
          ))}
          <option value="create">
            Offre distincte : créer une nouvelle offre
          </option>
          <option value="dismiss">Ne pas importer cette proposition</option>
        </select>
      </WriteForm>
    </div>
  );
}
