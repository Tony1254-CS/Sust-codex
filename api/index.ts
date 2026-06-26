import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  res.status(200).json({ 
    app: 'QueueStorm Investigator',
    status: 'online',
    endpoints: ['/health', '/analyze-ticket']
  });
}
