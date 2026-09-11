import { Request, Response } from 'express'

export function healthCheck(_req: Request, res: Response) {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'AURA HOMES API',
  })
}
