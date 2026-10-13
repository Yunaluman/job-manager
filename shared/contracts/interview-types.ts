export interface InterviewPlanInput {
  id: string
  applicationId: string
  title: string
  scheduledDate: string
  sourceDescription: string
  sourceReference: string
  note: string
  status: 'planned' | 'closed' | 'cancelled'
}
export interface InterviewPlan extends InterviewPlanInput {
  createdAt: string
  updatedAt: string
  history: { at: string; event: 'created' | 'updated' | 'rescheduled' | 'closed' | 'cancelled' | 'reopened'; values: InterviewPlanInput }[]
}
