import { DraftGuard } from "../../components/DraftGuard";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Offer } from "../../../shared/contracts/journey-types";
import { decideOffer } from "../../journey";
import { Button } from "../../shared/ui/Button";
export function OfferActions({ offer }: { offer: Offer }) {
  const navigate = useNavigate(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [rejecting, setRejecting] = useState(false),
    [reason, setReason] = useState("");
  async function decide(decision: "go" | "later" | "rejected") {
    setBusy(true);
    setError("");
    try {
      const result = await decideOffer(
        offer.id,
        decision,
        decision === "rejected" ? reason : "",
      );
      setRejecting(false);
      setReason("");
      if (decision === "go" && result.application)
        await navigate({
          to: "/candidatures/$id",
          params: { id: result.application.id },
          search: { tab: "documents" },
        });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Décision non confirmée.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4">
      <DraftGuard dirty={!!reason} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="app-primary"
          disabled={busy}
          onClick={() => void decide("go")}
        >
          {offer.applicationId
            ? "Reprendre ma candidature"
            : "Préparer ma candidature"}
        </Button>
        <Button
          type="button"
          className="app-button"
          disabled={busy}
          onClick={() => void decide("later")}
        >
          Plus tard
        </Button>
        <Button
          type="button"
          className="app-button"
          disabled={busy}
          onClick={() => setRejecting(!rejecting)}
        >
          Écarter
        </Button>
      </div>
      {rejecting && (
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void decide("rejected");
          }}
        >
          <label className="block text-sm">
            Motif pour écarter
            <input
              className="app-field mt-1"
              required
              maxLength={10000}
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <Button type="submit" className="app-button mt-2" disabled={busy}>
            Confirmer l’écartement
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
