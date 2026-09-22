import multer from 'multer'
import { BadRequestError } from '../services/adminService.js'

/**
 * Admin photo uploads arrive as multipart/form-data (`image` field). Files are
 * held in memory only (never written to the server disk) and handed straight to
 * the object-storage layer. Only image mime-types are allowed, with a 10 MB
 * cap, and at most one file per request.
 */

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
])

export class ImageTypeError extends BadRequestError {}

export const uploadSingleImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
      return cb(new ImageTypeError('Only JPEG, PNG, WebP, GIF and AVIF images are allowed.'))
    }
    cb(null, true)
  },
}).single('image')

export interface UploadedImageFile {
  buffer: Buffer
  mimetype: string
  originalname: string
}