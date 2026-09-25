import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { hashManagerPassword, isValidManagerPasswordShape } from '../src/lib/managerAuth.js'

/**
 * Deliberate manager credential management.
 *
 *   npm run db:manager-password -- --username manager --password "new-secret"
 *
 * The seeded account is only ever CREATED by `prisma/seed.ts`; this script is
 * the explicit way to set or rotate a password afterwards. Passwords are stored
 * as a scrypt hash — never in plaintext, never printed back out.
 */

const databaseUrl = process.env.DATABASE_URL ?? process.env.DIRECT_URL

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set. Add your Supabase pooler URL to server/.env (never commit it).'
  )
}

const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) })

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag)
  if (index === -1) return null
  return process.argv[index + 1] ?? null
}

async function main() {
  const username = argValue('--username')?.trim() || 'manager'
  const password = argValue('--password') ?? process.env.MANAGER_DEFAULT_PASSWORD ?? ''
  const enable = argValue('--disable') === null

  if (!isValidManagerPasswordShape(password)) {
    throw new Error(
      'Provide --password with at least 6 characters (or set MANAGER_DEFAULT_PASSWORD).'
    )
  }

  await prisma.managerUser.upsert({
    where: { username },
    update: { passwordHash: hashManagerPassword(password), isActive: enable },
    create: {
      username,
      displayName: 'Manager',
      passwordHash: hashManagerPassword(password),
      isActive: enable,
    },
  })

  // The password itself is intentionally not echoed.
  console.log(`Manager account "${username}" is now ${enable ? 'active' : 'disabled'}.`)
}

main()
  .catch((error: unknown) => {
    console.error('Manager password update failed:', error instanceof Error ? error.message : error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
