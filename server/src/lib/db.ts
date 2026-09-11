import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set. Add your Supabase transaction-mode pooler URL to server/.env (never commit it).'
  )
}

// Runtime traffic flows through the Supabase transaction-mode pooler while
// Prisma CLI operations (migrations) use DIRECT_URL from prisma7.config.ts.
const adapter = new PrismaPg(databaseUrl)

export const prisma = new PrismaClient({ adapter })