import type { Application } from '../contracts/types'
import type { JourneyState } from '../contracts/journey-types'
import type { Submission } from '../contracts/submission-types'
import type { Action } from '../contracts/action-types'
import type { InterviewPlan } from '../contracts/interview-types'
export function withDeclaredSends(application:Application,submissions:Submission[]):Application
export function nextJourneyStep(application:Application,journey:JourneyState,actions:Action[],interviewPlans?:InterviewPlan[]):{tab:'summary'|'documents';label:string;reason:string;actionId?:string;interviewPlanId?:string}
