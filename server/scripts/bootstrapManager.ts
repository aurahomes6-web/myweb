import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { managerSessionConfig } from '../src/lib/managerAuth.js'
import {
  DEFAULT_MANAGER_DISPLAY_NAME,
  DEFAULT_MANAGER_PASSWORD,
  DEFAULT_MANAGER_USERNAME,
  bootstrapManagerAccount,
  type ManagerUserDelegate,
} from '../src/lib/managerBootstrap.js'

/**
 * Idempotent manager bootstrap.
 *
 *   npm run db:manager-bootstrap
 *
 * Why this exists separately from `prisma/seed.ts` and `db:manager-password`:
 *
 *   - `db:seed` also rewrites Property rows, so it must not be the way a live
 *     database gets its manager account.
 *   - `db:manager-password` deliberately ROTATES a password on every run, which
 *     is right when you mean to change it and wrong as a "make it work" step.
 *
 * This script only ever CREATES the account when it is missing (see
 * `bootstrapManagerAccount`). Running it twice cannot create a duplicate and
 * cannot undo a rotation. Use `npm run db:manager-password` to change a password
 * on purpose.
 *
 * Credentials come from the environment, never from source:
 *   MANAGER_BOOTSTRAP_USERNAME (default "manager")
 *   MANAGER_BOOTSTRAP_PASSWORD (default "manager")
 *
 * It also reports whether the manager session is usable, because a missing
 * MANAGER_SESSION_SECRET produces "Manager access is not set up yet" at login
 * for a very different reason than a missing account.
 */

const databaseUrl = process.env.DATABASE_URL ?? process.env.DIRECT_URL

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set. Add your Supabase pooler URL to server/.env (never commit it).'
  )
}

const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) })

function envValue(name: string, fallback: string): string {
  const value = process.env[name]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

async function main() {
  const username = envValue('MANAGER_BOOTSTRAP_USERNAME', DEFAULT_MANAGER_USERNAME)
  const password = envValue('MANAGER_BOOTSTRAP_PASSWORD', DEFAULT_MANAGER_PASSWORD)
  const displayName = envValue('MANAGER_BOOTSTRAP_DISPLAY_NAME', DEFAULT_MANAGER_DISPLAY_NAME)

  const outcome = await bootstrapManagerAccount(prisma.managerUser as unknown as ManagerUserDelegate, {
    username,
    password,
    displayName,
  })

  if (outcome.action === 'existing') {
    console.log(`Manager account "${username}" already exists — left untouched (active: ${outcome.isActive}).`)
  } else {
    console.log(`Created manager account "${username}".`)
    if (password === DEFAULT_MANAGER_PASSWORD) {
      console.warn(
        'WARNING: this is the well-known default password. Rotate it before this is reachable by anyone else:'
      )
      console.warn('  npm run db:manager-password -- --username ' + username + ' --password "<strong secret>"')
    }
  }

  console.log(`Manager accounts in the database: ${outcome.total}.`)

  if (!managerSessionConfig(process.env)) {
    console.error(
      'MANAGER_SESSION_SECRET is not set, so /api/manager will answer 503 "Manager access is not set up yet".'
    )
    console.error('Add MANAGER_SESSION_SECRET (different from ADMIN_SESSION_SECRET) to server/.env.')
    process.exitCode = 1
    return
  }
  console.log('MANAGER_SESSION_SECRET is configured; /api/manager/login is reachable.')
}

main()
  .catch((error: unknown) => {
    console.error('Manager bootstrap failed:', error instanceof Error ? error.message : error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
