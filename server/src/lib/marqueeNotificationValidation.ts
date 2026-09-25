export const MAX_MARQUEE_NOTIFICATION_LENGTH = 240

export interface MarqueeNotificationIssue {
  field: string
  message: string
}

export interface CreateMarqueeNotificationInput {
  message: string
  isActive: boolean
}

export interface UpdateMarqueeNotificationInput {
  message?: string
  isActive?: boolean
}

export interface ReorderMarqueeNotificationsInput {
  ids: string[]
}

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: MarqueeNotificationIssue[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseMessage(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const message = value.trim()
  if (message.length === 0 || message.length > MAX_MARQUEE_NOTIFICATION_LENGTH) return null
  return message
}

function parseActive(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

export function parseCreateMarqueeNotification(
  body: unknown
): ValidationResult<CreateMarqueeNotificationInput> {
  if (!isRecord(body)) {
    return {
      ok: false,
      issues: [{ field: 'body', message: 'A JSON request body is required.' }],
    }
  }

  const issues: MarqueeNotificationIssue[] = []
  const message = parseMessage(body.message)
  if (message === null) {
    issues.push({
      field: 'message',
      message: `Notification text is required and must be 1–${MAX_MARQUEE_NOTIFICATION_LENGTH} characters.`,
    })
  }

  const isActive = body.isActive === undefined ? true : parseActive(body.isActive)
  if (isActive === null) {
    issues.push({ field: 'isActive', message: 'Active status must be true or false.' })
  }

  if (issues.length > 0 || message === null || isActive === null) return { ok: false, issues }
  return { ok: true, value: { message, isActive } }
}

export function parseUpdateMarqueeNotification(
  body: unknown
): ValidationResult<UpdateMarqueeNotificationInput> {
  if (!isRecord(body)) {
    return {
      ok: false,
      issues: [{ field: 'body', message: 'A JSON request body is required.' }],
    }
  }

  const issues: MarqueeNotificationIssue[] = []
  const hasMessage = Object.prototype.hasOwnProperty.call(body, 'message')
  const hasActive = Object.prototype.hasOwnProperty.call(body, 'isActive')
  if (!hasMessage && !hasActive) {
    return {
      ok: false,
      issues: [{ field: 'body', message: 'Provide a message or active status to update.' }],
    }
  }

  const message = hasMessage ? parseMessage(body.message) : undefined
  if (hasMessage && message === null) {
    issues.push({
      field: 'message',
      message: `Notification text is required and must be 1–${MAX_MARQUEE_NOTIFICATION_LENGTH} characters.`,
    })
  }

  const isActive = hasActive ? parseActive(body.isActive) : undefined
  if (hasActive && isActive === null) {
    issues.push({ field: 'isActive', message: 'Active status must be true or false.' })
  }

  if (issues.length > 0) return { ok: false, issues }
  const value: UpdateMarqueeNotificationInput = {}
  if (message !== undefined && message !== null) value.message = message
  if (isActive !== undefined && isActive !== null) value.isActive = isActive
  return { ok: true, value }
}

export function parseReorderMarqueeNotifications(
  body: unknown
): ValidationResult<ReorderMarqueeNotificationsInput> {
  if (!isRecord(body)) {
    return {
      ok: false,
      issues: [{ field: 'body', message: 'A JSON request body is required.' }],
    }
  }

  if (!Array.isArray(body.ids)) {
    return {
      ok: false,
      issues: [{ field: 'ids', message: 'Notification ids must be an array.' }],
    }
  }

  const ids: string[] = []
  for (const value of body.ids) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return {
        ok: false,
        issues: [{ field: 'ids', message: 'Every notification id must be a non-empty string.' }],
      }
    }
    ids.push(value.trim())
  }

  if (new Set(ids).size !== ids.length) {
    return {
      ok: false,
      issues: [{ field: 'ids', message: 'Notification ids must not contain duplicates.' }],
    }
  }

  return { ok: true, value: { ids } }
}
