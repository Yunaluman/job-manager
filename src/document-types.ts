export type DocumentStatus = 'draft' | 'ready' | 'archived'
export type LetterField = 'sender' | 'recipient' | 'placeDate' | 'subject' | 'greeting' | 'body' | 'closing' | 'signature'
export type LetterContent = Record<LetterField, string>
export interface CvEntry { title: string; organization: string; period: string; description: string }
export interface CvContent { name: string; contact: string; title: string; summary: string; experiences: CvEntry[]; education: CvEntry[]; skills: string[]; languages: string[]; links: string[] }
export interface DocumentLayout { fontSize: number; marginMm: number; hidden: string[]; order?: string[] }
export interface JobDocument { id: string; kind: 'letter' | 'cv'; applicationId?: string; createdAt: string; updatedAt: string; latestVersionId: string }
export interface DocumentVersion { id: string; documentId: string; number: number; createdAt: string; title: string; status: DocumentStatus; content: LetterContent | CvContent; layout: DocumentLayout; templateVersion: 'classic-letter-v1' | 'single-column-cv-v1'; parentVersionId?: string; sources: { prefill?: import('./components/CvPrefill').PrefillTrace; originalId?: string; offerText?: string; cvText?: string; legacyText?: string; cvVersionId?: string; generationModel?:string; generationMode?:'manual'|'api' } }
export interface DocumentInput { kind: 'letter' | 'cv'; applicationId?: string; title: string; status: DocumentStatus; content: LetterContent | CvContent; layout: DocumentLayout; parentVersionId?: string; sources: DocumentVersion['sources'] }
