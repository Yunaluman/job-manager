import type { Application } from "../contracts/types";
import type { JourneyState } from "../contracts/journey-types";
import type { Action, ActionNotification } from "../contracts/action-types";
import type { InterviewPlan } from "../contracts/interview-types";
export function dashboardSummary(
  state: {
    applications: Application[];
    journey: JourneyState;
    actions: Action[];
    interviewPlans: InterviewPlan[];
  },
  day: string,
  periodDays?: number,
): {
  sent: number;
  waiting: number;
  interviews: number;
  followups: number;
  preparation: Application[];
  alerts: ActionNotification[];
  unknownHistory: number;
  activity: {
    id: string;
    at: string;
    label: string;
    company: string;
    applicationId?: string;
    offerId?: string;
  }[];
  start: string;
};
