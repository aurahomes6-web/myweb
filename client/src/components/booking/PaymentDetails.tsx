import { useState } from 'react'
import { Check, Copy, CreditCard, Download, Phone, QrCode, UserRound } from 'lucide-react'
import { copyUpiId, downloadUpiQr } from '@/lib/upi'
import type { PaymentSettingsInfo } from '@/types'

interface PaymentDetailsProps {
  /** Active payment details (admin-editable; falls back to the site defaults). */
  settings: PaymentSettingsInfo
}

/**
 * The “Pay via UPI” card shown on the customer payment page.
 *
 * Every displayed value comes from props (fetched from GET /api/payment-settings
 * by the parent), so the admin's edits — payee name, UPI id, phone and the QR
 * asset — are what customers actually see and download. Visual design is
 * identical to the previous hard-coded card.
 */
export function PaymentDetails({ settings }: PaymentDetailsProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    const ok = await copyUpiId(settings.upiId)
    if (!ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2200)
  }

  return (
    <div className="card-surface flex flex-col rounded-panel p-6 sm:p-7">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple/30 to-magenta/20 text-purple-bright">
          <QrCode size={17} />
        </div>
        <div>
          <h3 className="font-display text-lg font-semibold text-text-primary">Pay via UPI</h3>
          <p className="mt-1 text-sm leading-relaxed text-text-muted">
            Scan this QR from any UPI app (GPay, PhonePe, Paytm, BHIM) and pay the
            amount shown above.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:justify-center">
        <div className="shrink-0 rounded-2xl border border-surface-300/60 bg-white p-4">
          <img
            src={settings.qrCodeUrl}
            alt="Aura Homes UPI QR code"
            width={220}
            height={220}
            className="h-56 w-56 rounded-xl object-contain"
          />
        </div>

        <div className="flex w-full max-w-sm flex-col gap-3">
          <dl className="flex flex-col divide-y divide-surface-300/40">
            <div className="flex items-center justify-between gap-3 py-3">
              <dt className="flex items-center gap-2 text-sm text-text-muted">
                <UserRound size={14} className="text-cyan-bright" /> Payable to
              </dt>
              <dd className="text-sm font-semibold text-text-primary">{settings.upiName}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-3">
              <dt className="flex items-center gap-2 text-sm text-text-muted">
                <Phone size={14} className="text-cyan-bright" /> Phone
              </dt>
              <dd className="font-mono text-sm font-semibold text-text-primary">{settings.upiPhone}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-3">
              <dt className="flex items-center gap-2 text-sm text-text-muted">
                <CreditCard size={14} className="text-cyan-bright" /> UPI ID
              </dt>
              <dd className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-text-primary">{settings.upiId}</span>
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-surface-300/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary transition-colors hover:border-cyan/45 hover:text-cyan-bright"
                >
                  {copied ? <Check size={11} className="text-cyan-bright" /> : <Copy size={11} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </dd>
            </div>
          </dl>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => void downloadUpiQr(settings.qrCodeUrl)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-surface-300/80 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-text-primary transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan/45 hover:shadow-glow-cyan"
            >
              <Download size={14} className="text-cyan-bright" />
              Save QR image
            </button>
            <p className="text-center text-[11px] text-text-muted">
              Tip: save the QR to pay from another device, or copy the UPI ID above.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}