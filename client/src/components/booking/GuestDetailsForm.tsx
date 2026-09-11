import { Lock, User, Mail, Phone } from 'lucide-react'

/**
 * Guest information shell for the booking flow.
 *
 * Deliberately locked and structured for Phase 4, when registration and real
 * submission will be wired in. The form controls are disabled and carry the
 * `data-phase="4"` marker so the next phase can enable and extend them without
 * reworking the layout.
 */
export default function GuestDetailsForm() {
  const inputClasses =
    'input-glass w-full px-4 py-3.5 text-sm text-text-primary placeholder:text-text-muted/50 disabled:cursor-not-allowed disabled:opacity-55'

  return (
    <section id="guest-details" aria-labelledby="guest-details-heading" data-phase="4">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="guest-details-heading"
            className="font-display text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl"
          >
            Guest Information
          </h2>
          <p className="mt-2 text-sm text-text-muted">
            Where your registration and contact details will live in the next phase.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-surface-300/50 bg-surface-100/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">
          <Lock size={12} /> Coming in Phase 4
        </span>
      </div>

      <div className="card-surface flex flex-col gap-4 rounded-panel p-6 sm:p-7">
        <div>
          <label htmlFor="guest-name" className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-text-secondary">
            <User size={13} className="text-cyan-bright" /> Full name
          </label>
          <input id="guest-name" type="text" disabled placeholder="Your full name" className={inputClasses} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="guest-email" className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-text-secondary">
              <Mail size={13} className="text-cyan-bright" /> Email
            </label>
            <input id="guest-email" type="email" disabled placeholder="you@example.com" className={inputClasses} />
          </div>
          <div>
            <label htmlFor="guest-phone" className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-text-secondary">
              <Phone size={13} className="text-cyan-bright" /> Phone
            </label>
            <input id="guest-phone" type="tel" disabled placeholder="+91 00000 00000" className={inputClasses} />
          </div>
        </div>

        <div className="mt-1 rounded-2xl border border-surface-300/40 bg-surface-100/40 p-4 text-sm leading-relaxed text-text-muted">
          Registration, identity verification (including Aadhaar &amp; WhatsApp
          confirmation), payment, and your official booking ticket will be added in the
          next phase. Nothing is collected yet.
        </div>
      </div>
    </section>
  )
}