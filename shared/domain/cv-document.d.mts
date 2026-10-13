import type { CvContent, DocumentLayout } from '../contracts/document-types'
export const CV_SECTIONS: string[]
export const CV_LABELS: Record<string, string>
export function validateCv(content: CvContent, layout: DocumentLayout): void
export function cvBlocks(content: CvContent, layout: DocumentLayout): { text: string; bold?: boolean; after: number }[]
export function cvText(content: CvContent, layout: DocumentLayout): string
