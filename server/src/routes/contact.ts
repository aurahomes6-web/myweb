import { Router } from 'express'
import { getContactHandler } from '../controllers/contactController.js'

const router = Router()

// Public footer contact configuration (email, phone, description only).
router.get('/', getContactHandler)

export default router