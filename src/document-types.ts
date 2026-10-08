export type DocumentStatus = 'draft' | 'ready' | 'archived'
export type LetterField = 'sender' | 'recipient' | 'placeDate' | 'subject' | 'greeting' | 'body' | 'closing' | 'signature'
export type LetterContent = Record<LetterField, string>
export interface DocumentLayout { fontSize: number; marginMm: number; hidden: LetterField[] }
export interface JobDocument { id: string; kind: 'letter'; applicationId: string; createdAt: string; updatedAt: string; latestVersionId: string }
export interface DocumentVersion { id: string; documentId: string; number: number; createdAt: string; title: string; status: DocumentStatus; content: LetterContent; layout: DocumentLayout; templateVersion: 'classic-letter-v1'; parentVersionId?: string; sources: { offerText?: string; cvText?: string; legacyText?: string } }
export interface DocumentInput { kind: 'letter'; applicationId: string; title: string; status: DocumentStatus; content: LetterContent; layout: DocumentLayout; parentVersionId?: string; sources: DocumentVersion['sources'] }
