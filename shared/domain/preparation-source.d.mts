import type { Application } from '../contracts/types'
import type { JourneyState } from '../contracts/journey-types'
export function resolvePreparationCv(application:Application,journey:JourneyState,originals:{id:string;format:string;createdAt:string}[]):{kind:'original'|'version'|'profile';id:string}
