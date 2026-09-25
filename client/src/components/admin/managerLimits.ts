/**
 * Client-side mirrors of the manager checklist limits enforced by
 * `server/src/lib/managerChecklistValidation.ts`.
 *
 * They exist purely so the form can show a helpful message before a round trip;
 * the server remains the authority and re-validates every request.
 */
export const MAX_CHECKLIST_TITLE_LENGTH = 120
export const MAX_CHECKLIST_DESCRIPTION_LENGTH = 300
export const MAX_MANAGER_REPORT_LENGTH = 1500
