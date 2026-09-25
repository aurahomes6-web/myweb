import { Router } from 'express'
import { prisma } from '../lib/db.js'
import { managerSessionConfig, requireManager, requireManagerCsrfHeader } from '../lib/managerAuth.js'
import {
  managerChecklistHandler,
  managerCompletionHandler,
  managerConfigHandler,
  managerLogin,
  managerLogout,
  managerMe,
  managerPropertiesHandler,
  managerReportHandler,
} from '../controllers/managerController.js'

/**
 * Manager API — mounted at /api/manager, deliberately separate from /api/admin.
 *
 * A manager session lives in its own `aura_manager_session` cookie signed with
 * MANAGER_SESSION_SECRET and is validated against the `ManagerUser` table, so
 * it grants access to exactly these routes and nothing else. There is no admin
 * route that accepts it.
 */
const config = managerSessionConfig(process.env)
const auth = requireManager(config, prisma)

const router = Router()

// Public entry point: exchange manager credentials for a session cookie.
router.post('/login', requireManagerCsrfHeader, managerLogin(config))
router.post('/logout', requireManagerCsrfHeader, managerLogout(config))

// Everything else requires a valid, active manager session.
router.get('/me', auth, managerMe)
router.get('/config', auth, managerConfigHandler)
router.get('/properties', auth, managerPropertiesHandler)
router.get('/checklist/:propertyId', auth, managerChecklistHandler)
router.post(
  '/checklist/:propertyId/:itemId',
  requireManagerCsrfHeader,
  auth,
  managerCompletionHandler
)
router.post('/report', requireManagerCsrfHeader, auth, managerReportHandler)

export default router
