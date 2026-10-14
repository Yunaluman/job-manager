import { applicationEvents } from "./application-events.mjs";
import { withDeclaredSends } from "./journey-progress.mjs";
import {
  actionNotifications,
  isOpenDossier,
  shiftDay,
} from "./actions-core.mjs";
export function dashboardSummary(
  { applications, journey, actions, interviewPlans },
  day,
  periodDays = 30,
) {
  const apps = applications.map((app) =>
      withDeclaredSends(app, journey.submissions),
    ),
    start = shiftDay(day, 1 - periodDays);
  const sends = (app) =>
    applicationEvents(app).filter((e) => e.kind === "sent");
  const sent = apps.filter((app) =>
    sends(app).some((e) => e.occurredAt >= start && e.occurredAt <= day),
  ).length;
  const open = apps.filter(isOpenDossier);
  const waiting = open.filter((app) => {
    const latest = sends(app)
      .map((e) => e.occurredAt)
      .sort()
      .at(-1);
    return (
      latest &&
      ["a_postuler", "postulee", "relancee"].includes(app.status) &&
      !applicationEvents(app).some(
        (e) =>
          ["response", "interview", "offer", "refusal"].includes(e.kind) &&
          e.occurredAt >= latest,
      )
    );
  }).length;
  const interviews = interviewPlans.filter(
    (p) => p.status === "planned" && p.scheduledDate >= day,
  );
  const alerts = actionNotifications(
    actions,
    applications,
    [],
    day,
    interviewPlans,
  );
  const followups = alerts.filter(
    (a) =>
      a.dueDate <= day &&
      (a.origin === "source" ||
        (a.origin === "action" &&
          actions.find((item) => item.id === a.actionId)?.kind ===
            "follow-up")),
  );
  const preparation = open.filter(
    (app) => app.status === "a_postuler" && !sends(app).length,
  );
  const activity = [
    ...apps.flatMap((app) =>
      (app.history ?? []).map((entry, index) => ({
        id: `app:${app.id}:${index}`,
        at: entry.date,
        label: entry.event,
        company: app.company,
        applicationId: app.id,
      })),
    ),
    ...journey.offers
      .filter((o) => o.dailyProposal)
      .map((o) => ({
        id: `offer:${o.id}`,
        at: o.dailyProposal.receivedAt,
        label: "Proposition reçue",
        company: o.company,
        offerId: o.id,
      })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6);
  return {
    sent,
    waiting,
    interviews: interviews.length,
    followups: followups.length,
    preparation,
    alerts: alerts.filter((a) => a.dueDate <= day),
    unknownHistory: apps.filter((app) => app.eventHistoryComplete !== true)
      .length,
    activity,
    start,
  };
}
