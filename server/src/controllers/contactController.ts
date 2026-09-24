import { Request, Response } from 'express'
import { prisma } from '../lib/db.js'
import { getContactSettings } from '../services/contactService.js'

/**
 * Public endpoint for the footer's CONTACT section. Returns ONLY the three
 * editable values — email, phone and description — never any other admin
 * configuration.
 */
export async function getContactHandler(_req: Request, res: Response) {
  const contact = await getContactSettings(prisma)
  res.json(contact)
}