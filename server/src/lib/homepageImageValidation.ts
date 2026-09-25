import sharp from 'sharp'
import { BadRequestError } from '../services/adminService.js'

const MAX_HOMEPAGE_IMAGE_PIXELS = 40_000_000
const MIME_BY_FORMAT: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}

function imageOptions() {
  return {
    failOn: 'error' as const,
    limitInputPixels: MAX_HOMEPAGE_IMAGE_PIXELS,
  }
}

function detectedMime(format: string, compression: string | undefined): string | null {
  if (format === 'heif' && compression === 'av1') return 'image/avif'
  if (format === 'avif') return 'image/avif'
  return MIME_BY_FORMAT[format] ?? null
}

export async function assertValidHomepageImage(buffer: Buffer, contentType: string): Promise<void> {
  try {
    const metadata = await sharp(buffer, imageOptions()).metadata()
    if (detectedMime(metadata.format, metadata.compression) !== contentType) {
      throw new Error('Image content does not match its declared type.')
    }
    await sharp(buffer, imageOptions())
      .resize({ width: 1, height: 1, fit: 'inside' })
      .toBuffer()
  } catch {
    throw new BadRequestError(
      'The uploaded file is not a valid JPEG, PNG, WebP, GIF or AVIF image.'
    )
  }
}
