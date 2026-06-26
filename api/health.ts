// api/health.ts
// GET /health — readiness probe.
// Returns {"status":"ok"} immediately. Always 200.

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  res.status(200).json({ status: 'ok' });
}
