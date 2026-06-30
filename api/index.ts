import type { VercelRequest, VercelResponse } from '@vercel/node';

// @ts-expect-error build artifact
import handler from '../dist/server/server.js';

export default async function vercelHandler(req: VercelRequest, res: VercelResponse) {
  try {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url || '/', `${protocol}://${host}`);
    
    console.log(`Handling ${req.method} ${url.pathname}`);

    const request = new Request(url.toString(), {
      method: req.method,
      headers: new Headers(req.headers as Record<string, string>),
      // Vercel's req.body is already parsed, but Request constructor expects a BodyInit
      body: req.method !== 'GET' && req.method !== 'HEAD' ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body)) : undefined,
    });

    const response = await (handler as { fetch: (r: Request) => Promise<Response> }).fetch(request);

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const body = await response.text();
    res.end(body);
  } catch (error) {
    console.error('Error in vercelHandler:', error);
    res.statusCode = 500;
    res.end(`Internal Server Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}
