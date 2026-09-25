import type { CSSProperties } from 'react'
import { Sparkles } from 'lucide-react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useMarqueeNotifications } from '@/services/marqueeNotifications'
import type { MarqueeNotification } from '@/types/marqueeNotifications'

function NotificationSequence({
  notifications,
  hidden = false,
}: {
  notifications: MarqueeNotification[]
  hidden?: boolean
}) {
  return (
    <div
      className="flex min-w-screen w-max shrink-0 items-center"
      aria-hidden={hidden || undefined}
    >
      {notifications.map((notification) => (
        <span
          key={notification.id}
          className="flex shrink-0 items-center gap-5 px-7 text-[11px] font-semibold uppercase tracking-[0.22em] text-text-secondary sm:gap-7 sm:px-10 sm:text-xs"
        >
          <span className="whitespace-nowrap">{notification.message}</span>
          <Sparkles size={13} className="shrink-0 text-purple-bright" aria-hidden="true" />
        </span>
      ))}
    </div>
  )
}

export function MarqueeNotifications() {
  const notifications = useMarqueeNotifications()
  const reducedMotion = useReducedMotion()
  if (notifications.length === 0) return null

  const characterCount = notifications.reduce(
    (total, notification) => total + notification.message.length,
    0
  )
  const durationSeconds = Math.min(60, Math.max(24, characterCount / 10))
  const style = { '--aura-marquee-duration': `${durationSeconds}s` } as CSSProperties

  return (
    <section
      aria-label="AURA HOMES announcements"
      className="relative overflow-hidden border-y border-purple/20 bg-forest/70 py-0.5 shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)]"
    >
      <div
        className={
          reducedMotion
            ? 'overflow-x-auto'
            : 'overflow-hidden'
        }
      >
        <div
          className="aura-marquee-track flex w-max"
          style={style}
        >
          <NotificationSequence notifications={notifications} />
          <NotificationSequence notifications={notifications} hidden />
        </div>
      </div>
    </section>
  )
}
