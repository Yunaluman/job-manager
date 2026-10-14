export interface DailyProposal {
  id: string;
  company: string;
  title: string;
  location: string;
  text: string;
  url: string;
  verifiedAt: string;
  source: string;
  method: string;
  score: number | null;
  justification: string;
}
export interface DailyProvenance {
  batchId: string;
  receivedAt: string;
  proposal: DailyProposal;
}
export interface DailyBatch {
  format: "jobpilot-daily-proposals";
  version: 1;
  id: string;
  createdAt: string;
  proposals: DailyProposal[];
}
export interface DailyOutcome {
  proposalId: string;
  result: "created" | "duplicate" | "review" | "linked" | "dismissed";
  candidates: string[];
  offerId?: string;
  resolvedAt?: string;
}
export interface DailyReceipt {
  id: string;
  sha256: string;
  receivedAt: string;
  batch: DailyBatch;
  outcomes: DailyOutcome[];
}
