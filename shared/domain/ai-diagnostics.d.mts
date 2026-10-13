export interface AiDiagnostic { version: 1; kind: 'provider' | 'response' | 'transport' | 'timeout' | 'restart' | 'success'; httpStatus: number | null; providerCode: string | null; requestId: string | null }
export const providerCodes: Readonly<Record<string,string>>
export function validRequestId(value: unknown): boolean
export function validateDiagnostic(value: unknown): AiDiagnostic
export function diagnosticExplanation(value?: AiDiagnostic | null): string
