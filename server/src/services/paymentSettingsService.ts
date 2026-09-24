import type { PrismaClient } from '../generated/prisma/client.js'
import type { PaymentSettingsDetailsInput } from '../lib/paymentSettingsValidation.js'

/**
 * Global Direct-UPI payment configuration (payment page: payee name, UPI id,
 * phone and the active QR asset).
 *
 * Stored as a single singleton row (`id` = "single") exactly like
 * `contactService`. When no row exists yet (e.g. before the first read after a
 * migration) the current production UPI details are written as defaults so
 * production keeps working without any manual seeding.
 *
 * `qrCodeUrl` is the DURABLE QR: a Vercel Blob URL once an admin has uploaded
 * one. While it is still empty the active QR is the static `/qr.jpeg` asset
 * shipped with the site, so the payment page is never left with a broken or
 * missing QR during migration. Only the four public fields are ever
 * serialized — no session, secret or admin data reaches any endpoint.
 */

export interface PaymentSettingsDto {
  upiName: string
  upiId: string
  upiPhone: string
  /** Active QR asset: the stored Blob URL, or the static fallback while unset. */
  qrCodeUrl: string
}

export interface AdminPaymentSettingsDto extends PaymentSettingsDto {
  /** `blob` once an admin QR is stored; `fallback` while the static QR asset is still in use. */
  qrSource: 'blob' | 'fallback'
}

/** The UPI details the site has been shipping with (safe to write as defaults). */
export const DEFAULT_PAYMENT_SETTINGS = Object.freeze({
  upiName: 'R BALAKUMARAN',
  upiId: '9900662111@jupiteraxis',
  upiPhone: '+91 9900662111',
  qrCodeUrl: '',
})

/** Static QR asset served by the landing site — the migration-safe fallback. */
export const QR_FALLBACK_PATH = '/qr.jpeg'

const SINGLE_ROW_ID = 'single'

interface PaymentSettingsRow {
  id: string
  upiName: string
  upiId: string
  upiPhone: string
  qrCodeUrl: string
  createdAt: Date
  updatedAt: Date
}

function asRow(value: unknown): PaymentSettingsRow {
  return value as PaymentSettingsRow
}

/**
 * Fetch the singleton row, creating it with the current production defaults on
 * first use so an un-seeded database still serves working UPI details.
 */
export async function getPaymentSettings(client: PrismaClient): Promise<PaymentSettingsRow> {
  const row = await client.paymentSettings.findUnique({ where: { id: SINGLE_ROW_ID } })
  if (row) return asRow(row)
  return asRow(
    await client.paymentSettings.upsert({
      where: { id: SINGLE_ROW_ID },
      create: { id: SINGLE_ROW_ID, ...DEFAULT_PAYMENT_SETTINGS },
      update: {},
    })
  )
}

/** Active QR: the stored Blob URL, or `/qr.jpeg` while none has been uploaded. */
export function resolveQrCodeUrl(row: { qrCodeUrl: string }): string {
  const stored = row.qrCodeUrl.trim()
  return stored.length > 0 ? stored : QR_FALLBACK_PATH
}

/**
 * Public payment details for the customer payment page. Exactly four fields —
 * no ids, timestamps, session or secret data.
 */
export async function getPublicPaymentSettings(client: PrismaClient): Promise<PaymentSettingsDto> {
  const row = await getPaymentSettings(client)
  return {
    upiName: row.upiName,
    upiId: row.upiId,
    upiPhone: row.upiPhone,
    qrCodeUrl: resolveQrCodeUrl(row),
  }
}

/** Admin view: same public fields plus whether the durable Blob QR is in use. */
export async function getAdminPaymentSettings(
  client: PrismaClient
): Promise<AdminPaymentSettingsDto> {
  const row = await getPaymentSettings(client)
  const stored = row.qrCodeUrl.trim().length > 0
  return {
    upiName: row.upiName,
    upiId: row.upiId,
    upiPhone: row.upiPhone,
    qrCodeUrl: resolveQrCodeUrl(row),
    qrSource: stored ? 'blob' : 'fallback',
  }
}

/** Update the UPI name / id / phone. Never touches the active QR asset. */
export async function updatePaymentSettingsDetails(
  client: PrismaClient,
  input: PaymentSettingsDetailsInput
): Promise<AdminPaymentSettingsDto> {
  await client.paymentSettings.upsert({
    where: { id: SINGLE_ROW_ID },
    create: { id: SINGLE_ROW_ID, ...DEFAULT_PAYMENT_SETTINGS, ...input },
    update: input,
  })
  return getAdminPaymentSettings(client)
}

/**
 * Persist a new QR asset URL (called only AFTER the upload to object storage
 * succeeded, so the previously working QR stays active if anything fails).
 */
export async function setPaymentSettingsQr(
  client: PrismaClient,
  qrCodeUrl: string
): Promise<AdminPaymentSettingsDto> {
  await getPaymentSettings(client)
  await client.paymentSettings.update({
    where: { id: SINGLE_ROW_ID },
    data: { qrCodeUrl },
  })
  return getAdminPaymentSettings(client)
}
