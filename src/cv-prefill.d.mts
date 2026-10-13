import type { CvContent } from './document-types'
export type PrefillProposal = { field: keyof CvContent; value: CvContent[keyof CvContent]; evidence: string }
export const PREFILL_FIELDS: (keyof CvContent)[]
export function validatePrefill(proposals: unknown, source: string): PrefillProposal[]
export function localPrefill(source: string): PrefillProposal[]
export function prefillPrompt(source: string): string
