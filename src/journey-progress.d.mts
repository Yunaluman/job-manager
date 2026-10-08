import type { Application } from './types'
import type { JourneyState } from './journey-types'
import type { Submission } from './submission-types'
import type { Action } from './action-types'
export function withDeclaredSends(application:Application,submissions:Submission[]):Application
export function nextJourneyStep(application:Application,journey:JourneyState,actions:Action[]):{tab:'summary'|'documents';label:string;reason:string;actionId?:string}
