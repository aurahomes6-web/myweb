/**
 * Manager panel types.
 *
 * These mirror `server/src/services/managerService.ts`. Note what is NOT here:
 * no admin types, no booking types. A manager only ever sees properties, a
 * daily checklist and a report hand-off.
 */

export interface ManagerProperty {
  id: string
  name: string
  slug: string
}

export interface ManagerChecklistItem {
  id: string
  title: string
  description: string | null
  sortOrder: number
  isCompleted: boolean
  completedAt: string | null
}

export interface ManagerChecklistProgress {
  total: number
  completed: number
  remaining: number
  /** 0–100. */
  percent: number
}

export interface ManagerChecklist {
  propertyId: string
  propertyName: string
  /** The day these completions belong to (YYYY-MM-DD). */
  dateKey: string
  items: ManagerChecklistItem[]
  progress: ManagerChecklistProgress
}

export interface ManagerSession {
  username: string
  displayName: string | null
}

export interface ManagerConfig {
  whatsappConfigured: boolean
}

/** The server-composed WhatsApp click-to-chat link for a report. */
export interface ManagerReportPrepared {
  url: string
  recipient: string
  message: string
  propertyName: string
}

// ── admin-side checklist configuration (Admin → Manager) ────────────────────

export interface AdminChecklistItem {
  id: string
  propertyId: string
  title: string
  description: string | null
  sortOrder: number
  isActive: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
  /** Historical daily completions attached to this task. */
  completionCount: number
}

export interface AdminChecklistItemInput {
  title: string
  description?: string | null
  isActive?: boolean
}

export interface AdminChecklistItemUpdate {
  title?: string
  description?: string | null
  isActive?: boolean
}
