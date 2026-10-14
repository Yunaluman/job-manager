import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Send, Clock, CalendarDays, RotateCcw } from "lucide-react";
import { useData, usePersistenceStatus, synchronize } from "../../data";
import { usePlanningDay } from "../../PlanningClock";
import { dashboardSummary } from "../../../shared/domain/dashboard.mjs";
import { OfferScore } from "../offers/OfferScore";
import { DailyReviews } from "../offers/DailyReviews";
import { Button } from "../../shared/ui/Button";
export function Dashboard() {
  const state = useData(),
    status = usePersistenceStatus(),
    day = usePlanningDay(),
    [period, setPeriod] = useState(30);
  const metrics = dashboardSummary(state, day, period),
    offers = state.journey.offers
      .filter((o) => o.decision === "pending")
      .sort(
        (a, b) =>
          (b.dailyProposal?.proposal.score ?? -1) -
            (a.dailyProposal?.proposal.score ?? -1) ||
          b.createdAt.localeCompare(a.createdAt),
      );
  const ready = status.ready && !status.blocked && status.pending === 0;
  const stats = [
    {
      label: "Candidatures envoyées",
      value: metrics.sent,
      icon: Send,
      hint: `${period} derniers jours`,
    },
    {
      label: "En attente de réponse",
      value: metrics.waiting,
      icon: Clock,
      hint: "Situation actuelle",
    },
    {
      label: "Entretiens à venir",
      value: metrics.interviews,
      icon: CalendarDays,
      hint: "Dates annoncées",
    },
    {
      label: "Relances dues",
      value: metrics.followups,
      icon: RotateCcw,
      hint: "Aujourd’hui ou en retard",
    },
  ];
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {state.dailyStatus?.error && (
        <p role="alert" className="text-sm text-rose-700">
          {state.dailyStatus.error}
        </p>
      )}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Tableau de bord</h1>
        <label className="flex items-center gap-2 text-sm text-muted">
          Envois
          <select
            aria-label="Période des envois"
            className="app-field w-auto"
            value={period}
            onChange={(e) => setPeriod(Number(e.target.value))}
          >
            <option value={30}>30 jours</option>
            <option value={7}>7 jours</option>
            <option value={90}>90 jours</option>
          </select>
        </label>
      </header>
      <section
        aria-label="Indicateurs de candidature"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {stats.map(({ label, value, icon: Icon, hint }) => (
          <div className="app-panel p-4 sm:p-5" key={label}>
            <Icon size={18} className="mb-3 text-primary" />
            <p className="text-3xl font-semibold tabular-nums">
              {ready ? value : "—"}
            </p>
            <h2 className="mt-1 text-sm font-medium">{label}</h2>
            <p className="mt-1 text-xs text-muted">{hint}</p>
          </div>
        ))}
      </section>
      {!ready && (
        <p role="status" className="text-sm text-muted">
          {status.blocked
            ? "Données à synchroniser ; les compteurs sont indisponibles."
            : "Chargement ou confirmation en cours…"}
        </p>
      )}
      {ready && (
        <>
          <section className="app-panel p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-semibold">À faire aujourd’hui</h2>
              <Link to="/actions" search={{}} className="text-sm underline">
                Toutes les actions
              </Link>
            </div>
            {!metrics.preparation.length && !metrics.alerts.length ? (
              <p className="text-sm text-muted">Aucune tâche urgente connue.</p>
            ) : (
              <ul className="divide-y divide-line">
                {metrics.preparation.slice(0, 3).map((app) => (
                  <li
                    key={app.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium break-words">
                        {app.company} — {app.title}
                      </p>
                      <p className="text-xs text-muted">
                        Candidature à terminer · envoi non documenté
                      </p>
                    </div>
                    <Link
                      to="/candidatures/$id"
                      params={{ id: app.id }}
                      search={{ tab: "documents" }}
                      className="app-button"
                    >
                      Reprendre
                    </Link>
                  </li>
                ))}
                {metrics.alerts.slice(0, 4).map((alert) => (
                  <li
                    key={alert.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium break-words">
                        {alert.title}
                      </p>
                      <p className="text-xs text-muted">
                        {alert.dueDate}
                        {alert.dueDate < day ? " · à clarifier" : ""}
                      </p>
                    </div>
                    <Link
                      to="/actions"
                      search={
                        alert.interviewPlanId
                          ? { interview: alert.interviewPlanId }
                          : {}
                      }
                      className="app-button"
                    >
                      Voir
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {metrics.preparation.length > 3 && (
              <Link
                to="/candidatures"
                className="mt-3 inline-block text-sm underline"
              >
                Toutes les candidatures à terminer ({metrics.preparation.length}
                )
              </Link>
            )}
          </section>
          <section className="app-panel p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">
                Offres à examiner ({offers.length})
              </h2>
              <Link to="/offres" className="text-sm underline">
                Toutes les offres
              </Link>
            </div>
            {!offers.length ? (
              <p className="text-sm text-muted">
                Les prochaines propositions apparaîtront ici.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {offers.slice(0, 5).map((offer) => (
                  <li
                    key={offer.id}
                    className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold break-words">
                        {offer.company}
                      </p>
                      <p className="text-sm break-words">{offer.title}</p>
                      <p className="my-1 text-xs text-muted">
                        {offer.location || "Localisation inconnue"}
                      </p>
                      <OfferScore
                        offer={offer}
                        qualifications={state.journey.qualifications}
                      />
                    </div>
                    <Link
                      to="/offres"
                      search={{ offer: offer.id }}
                      className="app-button self-start"
                    >
                      Examiner l’offre
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <DailyReviews />
          <section className="app-panel p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Activité récente</h2>
              <Link to="/bilan" search={{}} className="text-sm underline">
                Bilan détaillé
              </Link>
            </div>
            {metrics.activity.length ? (
              <ul className="space-y-3">
                {metrics.activity.map((item) => (
                  <li key={item.id} className="text-sm">
                    <p className="break-words">
                      {item.label} · {item.company}
                    </p>
                    <p className="text-xs text-muted">
                      {new Date(item.at).toLocaleString("fr-FR")}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Aucune activité documentée.</p>
            )}
            <details className="mt-4 text-xs text-muted">
              <summary className="cursor-pointer">
                Comprendre les compteurs
              </summary>
              <p className="mt-2">
                {metrics.unknownHistory} dossier(s) avec historique incomplet.
                Un statut seul ne prouve aucun envoi ; un entretien annoncé
                n’est pas un entretien réalisé. Les envois comptent les dossiers
                ayant un envoi daté dans la période.
              </p>
            </details>
          </section>
        </>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <span>Réception locale au démarrage, puis toutes les 30 secondes.</span>
        <Button
          type="button"
          className="app-button"
          disabled={status.pending > 0}
          onClick={() => void synchronize().catch(() => {})}
        >
          Actualiser les données
        </Button>
      </div>
    </div>
  );
}
