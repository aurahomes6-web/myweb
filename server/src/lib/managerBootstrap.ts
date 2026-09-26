import { hashManagerPassword, isValidManagerPasswordShape } from './managerAuth.js'

/**
 * Idempotent manager-account creation.
 *
 * Lives here, separate from `scripts/bootstrapManager.ts`, so the guarantee that
 * matters — running the bootstrap again must never produce a second account and
 * must never undo a password rotation — can be tested without a database.
 *
 * The rule is deliberately narrow: this only ever CREATES an account when one is
 * missing. An existing row is left completely untouched (password hash, display
 * name and active flag), so:
 *
 *   - a second run cannot create a duplicate, and
 *   - a second run cannot silently revert a rotated password or re-activate a
 *     deliberately disabled account.
 *
 * Changing a password on purpose is `npm run db:manager-password`, not this.
 */

export const DEFAULT_MANAGER_USERNAME = 'manager'
export const DEFAULT_MANAGER_PASSWORD = 'manager'
export const DEFAULT_MANAGER_DISPLAY_NAME = 'Manager'

/** The slice of the Prisma `managerUser` delegate this module needs. */
export interface ManagerUserDelegate {
  findUnique(args: {
    where: { username: string }
    select: { id: true; isActive: true }
  }): Promise<{ id: string; isActive: boolean } | null>
  create(args: {
    data: { username: string; displayName: string; passwordHash: string; isActive: boolean }
  }): Promise<{ id: string; username: string; isActive: boolean }>
  count(): Promise<number>
}

export interface ManagerBootstrapOptions {
  username: string
  password: string
  displayName: string
}

export type ManagerBootstrapOutcome =
  | { action: 'created'; isActive: true; total: number }
  | { action: 'existing'; isActive: boolean; total: number }

/**
 * Ensure a manager account exists for `username`. Never updates an existing one.
 *
 * Throws when the password fails the shape rules rather than storing something
 * that can never be entered at the login screen.
 */
export async function bootstrapManagerAccount(
  client: ManagerUserDelegate,
  { username, password, displayName }: ManagerBootstrapOptions
): Promise<ManagerBootstrapOutcome> {
  if (!isValidManagerPasswordShape(password)) {
    throw new Error(
      'MANAGER_BOOTSTRAP_PASSWORD must be 6-128 characters. Change it with npm run db:manager-password.'
    )
  }

  const existing = await client.findUnique({
    where: { username },
    select: { id: true, isActive: true },
  })

  if (existing) {
    return { action: 'existing', isActive: existing.isActive, total: await client.count() }
  }

  await client.create({
    data: {
      username,
      displayName,
      passwordHash: hashManagerPassword(password),
      isActive: true,
    },
  })
  return { action: 'created', isActive: true, total: await client.count() }
}
