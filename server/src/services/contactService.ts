import type { PrismaClient } from '../generated/prisma/client.js'
import type { ContactSettingsInput } from '../lib/contactValidation.js'

/**
 * Global AURA HOMES contact configuration (CONTACT section of the public footer).
 *
 * Stored as a single singleton row (`id` = "single"). When no row exists yet
 * (e.g. before the migration is applied) the current footer defaults are
 * returned, matching the values the footer shipped with. Only the three public
 * fields are ever serialized — nothing else is exposed through any endpoint.
 */

export interface ContactSettingsDto {
  email: string
  phone: string
  description: string
}

export const DEFAULT_CONTACT_SETTINGS: ContactSettingsDto = Object.freeze({
  email: 'stay@aurahomes.com',
  phone: '+91 00000 00000',
  description: 'Premium penthouse locations',
})

const SINGLE_ROW_ID = 'single'

export async function getContactSettings(client: PrismaClient): Promise<ContactSettingsDto> {
  const row = await client.contactSettings.findUnique({ where: { id: SINGLE_ROW_ID } })
  if (!row) return { ...DEFAULT_CONTACT_SETTINGS }
  return {
    email: row.email,
    phone: row.phone,
    description: row.description,
  }
}

export async function updateContactSettings(
  client: PrismaClient,
  input: ContactSettingsInput
): Promise<ContactSettingsDto> {
  await client.contactSettings.upsert({
    where: { id: SINGLE_ROW_ID },
    create: { id: SINGLE_ROW_ID, ...input },
    update: input,
  })
  return { ...input }
}