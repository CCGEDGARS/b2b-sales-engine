import pinAuthHandler from '../server/pin-auth-handler.js';
import { databaseConfigured } from '../server/neon-http.js';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-robots-tag', 'noindex');
  res.end(JSON.stringify(body));
}

function isAuthRequest(req) {
  if (req.method === 'POST') return true;
  if (req.method !== 'GET') return false;
  try {
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost');
    const url = new URL(req.url || '/api/status', `https://${host}`);
    return url.searchParams.has('action');
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (isAuthRequest(req)) return pinAuthHandler(req, res);
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed.' });
  return send(res, 200, {
    application: 'b2b-sales-engine',
    authentication: {
      configured: databaseConfigured(),
      endpoint: '/api/pin-auth',
      mode: 'server-pin-auth-v1'
    },
    sourceOfTruth: 'github',
    recoveryBranch: 'recovery/tele2-production'
  });
}
