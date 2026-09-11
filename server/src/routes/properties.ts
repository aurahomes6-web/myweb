import { Router } from 'express'
import {
  getPropertyHandler,
  listPropertiesHandler,
} from '../controllers/propertyController.js'

const router = Router()

router.get('/', listPropertiesHandler)
router.get('/:id', getPropertyHandler)

export default router