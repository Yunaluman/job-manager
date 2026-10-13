import type { Criterion, Qualification } from '../contracts/journey-types'
export interface QualificationProposal {criterionId:string;result:'met'|'unmet'|'unknown';justification:string;cvEvidence:string;offerEvidence:string}
export interface QualificationSummary {score:number|null;totalWeight:number;evaluatedWeight:number;unknownWeight:number;coverage:number;recommendation:'go'|'verify'|'rejected'}
export function qualificationSummary(entries:Qualification['entries']):QualificationSummary
export function validateQualificationProposals(proposals:unknown,criteria:Criterion[],cvText:string,offerText:string):QualificationProposal[]
export function qualificationPrompt(criteria:Criterion[],cvText:string,offerText:string):string
