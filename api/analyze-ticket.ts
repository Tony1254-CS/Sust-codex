// api/analyze-ticket.ts
// POST /analyze-ticket — main investigation endpoint.
// Accepts one ticket, validates, runs pipeline, returns structured JSON.
// Must complete within 30 seconds.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateRequest } from '../src/validation/request-schema';
import { investigate } from '../src/pipeline/orchestrator';
import { logger } from '../src/utils/logger';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Only accept POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    // Layer 0: Parse + validate input
    const validation = validateRequest(req.body);

    if (!validation.success) {
      logger.warn('Request validation failed', {
        statusCode: validation.statusCode,
        error: validation.error,
      });

      res.status(validation.statusCode).json({ error: validation.error });
      return;
    }

    // Layers 1-6: Investigation pipeline
    const response = await investigate(validation.data);

    res.status(200).json(response);
  } catch (error: unknown) {
    // Centralized error handler — never expose internals
    logger.error('Unhandled error in analyze-ticket', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Return safe 500 — no stack traces, no secrets
    res.status(500).json({ error: 'internal_error' });
  }
}
