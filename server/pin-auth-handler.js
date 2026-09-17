import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { databaseConfigured, neonHttpQuery } from './neon-http.js';

const COOKIE_NAME = 'b2b_sales_session';
const SESSION_HOURS = 8;
const MAX_ATTEMPTS = 5;
const LOCK_SECONDS = 30;
const MAX_BODY_BYTES = 32 * 1024;
const PIN_DIGITS = 4;
const DEFAULT_PIN = '0000';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-robots-tag', 'noindex');
  res.end(JSON.stringify(body));
}

function requestUrl(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost');
  return new URL(req.url || '/api/pin-auth', `https://${host}`);
}

function sameOriginWrite(req) {
  const origin = String(req.headers.origin || '').trim();
  if (!origin) return true;
  try {
    const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
    return new URL(origin).host.toLowerCase() === requestHost;
  } catch {
    return false;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        const error = new Error('Authentication request is too large.');
        error.status = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        const error = new Error('Invalid JSON payload.');
        error.status = 400;
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const index = part.indexOf('=');
      if (index < 0) return [part, ''];
      return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
    }));
}

function tokenHash(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

function pinDigest(pin, salt) {
  return scryptSync(String(pin), String(salt), 64).toString('hex');
}

function makePinRecord(pin) {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: pinDigest(pin, salt) };
}

function isValidPin(pin) {
  return /^\d{4}$/.test(String(pin || ''));
}

function pinMatches(row, pin) {
  if (!row?.pin_hash || !row?.pin_salt) return false;
  const candidate = Buffer.from(pinDigest(pin, row.pin_salt), 'hex');
  const expected = Buffer.from(String(row.pin_hash), 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function usesDefaultPin(row) {
  return pinMatches(row, DEFAULT_PIN);
}

function isValidExternalKey(value) {
  return /^[a-z0-9][a-z0-9-]{0,79}$/.test(String(value || ''));
}

function setSessionCookie(res, token) {
  const maxAge = SESSION_HOURS * 60 * 60;
  res.setHeader('set-cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
}

function clearSessionCookie(res) {
  res.setHeader('set-cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

function publicUser(row, { includePinDisplay = false } = {}) {
  const user = {
    externalKey: String(row.external_key || ''),
    name: String(row.name || ''),
    role: String(row.role || ''),
    pinConfigured: Boolean(row.pin_hash)
  };
  if (includePinDisplay) {
    const defaultPin = usesDefaultPin(row);
    user.pinType = !row.pin_hash ? 'none' : defaultPin ? 'default' : 'custom';
    user.pinDisplay = defaultPin ? DEFAULT_PIN : null;
  }
  return user;
}

async function listUsers({ includePinDisplay = false } = {}) {
  const rows = await neonHttpQuery(
    `SELECT external_key, name, role, pin_salt, pin_hash
       FROM app_users
      WHERE is_active = true
      ORDER BY CASE WHEN role = 'manager' THEN 0 ELSE 1 END, name`
  );
  return rows.map(row => publicUser(row, { includePinDisplay }));
}

async function currentSession(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return null;
  const rows = await neonHttpQuery(
    `SELECT u.id, u.external_key, u.name, u.role
       FROM app_sessions s
       JOIN app_users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.expires_at > now()
        AND u.is_active = true
      LIMIT 1`,
    [tokenHash(token)]
  );
  if (!rows.length) return null;
  await neonHttpQuery(`UPDATE app_sessions SET last_seen_at = now() WHERE token_hash = $1`, [tokenHash(token)]).catch(() => null);
  return { id: String(rows[0].id || ''), externalKey: String(rows[0].external_key || ''), name: String(rows[0].name || ''), role: String(rows[0].role || '') };
}

async function issueSession(req, res, userId) {
  const currentToken = parseCookies(req)[COOKIE_NAME];
  if (currentToken) await neonHttpQuery(`DELETE FROM app_sessions WHERE token_hash = $1`, [tokenHash(currentToken)]).catch(() => null);
  const token = randomBytes(32).toString('base64url');
  const hash = tokenHash(token);
  await neonHttpQuery(`DELETE FROM app_sessions WHERE user_id = $1 OR expires_at <= now()`, [userId]);
  await neonHttpQuery(`INSERT INTO app_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '8 hours')`, [hash, userId]);
  setSessionCookie(res, token);
}

function retrySeconds(value) {
  const until = Date.parse(String(value || ''));
  if (!Number.isFinite(until)) return 0;
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

async function requireManager(req, res) {
  const session = await currentSession(req);
  if (session?.role !== 'manager') {
    send(res, 403, { error: 'Manager authentication is required.', code: 'manager_auth_required' });
    return null;
  }
  return session;
}

async function login(req, res, body) {
  const externalKey = String(body.externalKey || '').trim();
  const pin = String(body.pin || '').trim();
  if (!externalKey || !isValidPin(pin)) return send(res, 400, { error: `User and a ${PIN_DIGITS}-digit PIN are required.`, code: 'invalid_login_payload' });

  const rows = await neonHttpQuery(`SELECT id, external_key, name, role, pin_salt, pin_hash, failed_pin_attempts, pin_locked_until FROM app_users WHERE external_key = $1 AND is_active = true LIMIT 1`, [externalKey]);
  if (!rows.length) return send(res, 404, { error: 'User not found.', code: 'user_not_found' });
  const user = rows[0];
  if (!user.pin_hash || !user.pin_salt) return send(res, 409, { error: 'PIN is not configured for this user.', code: 'pin_not_configured' });

  const lockedFor = retrySeconds(user.pin_locked_until);
  if (lockedFor > 0) return send(res, 429, { error: 'Too many incorrect attempts.', code: 'pin_locked', retryAfterSeconds: lockedFor });

  if (!pinMatches(user, pin)) {
    const nextAttempts = Number(user.failed_pin_attempts || 0) + 1;
    if (nextAttempts >= MAX_ATTEMPTS) {
      await neonHttpQuery(`UPDATE app_users SET failed_pin_attempts = 0, pin_locked_until = now() + interval '30 seconds', updated_at = now() WHERE id = $1`, [user.id]);
      return send(res, 429, { error: 'Too many incorrect attempts.', code: 'pin_locked', retryAfterSeconds: LOCK_SECONDS });
    }
    await neonHttpQuery(`UPDATE app_users SET failed_pin_attempts = $2, pin_locked_until = NULL, updated_at = now() WHERE id = $1`, [user.id, nextAttempts]);
    return send(res, 401, { error: 'Incorrect PIN.', code: 'invalid_pin', attemptsRemaining: MAX_ATTEMPTS - nextAttempts });
  }

  await neonHttpQuery(`UPDATE app_users SET failed_pin_attempts = 0, pin_locked_until = NULL, last_login_at = now(), updated_at = now() WHERE id = $1`, [user.id]);
  await issueSession(req, res, user.id);
  return send(res, 200, { authenticated: true, user: publicUser(user) });
}

async function setPin(req, res, body) {
  if (!(await requireManager(req, res))) return;
  const targetExternalKey = String(body.targetExternalKey || '').trim();
  const pin = String(body.pin || '').trim();
  if (!targetExternalKey || !isValidPin(pin)) return send(res, 400, { error: `A target user and ${PIN_DIGITS}-digit PIN are required.`, code: 'invalid_pin_payload' });
  const targetRows = await neonHttpQuery(`SELECT id, external_key, name, role, pin_salt, pin_hash FROM app_users WHERE external_key = $1 AND is_active = true LIMIT 1`, [targetExternalKey]);
  if (!targetRows.length) return send(res, 404, { error: 'User not found.', code: 'user_not_found' });
  const target = targetRows[0];
  const record = makePinRecord(pin);
  await neonHttpQuery(`UPDATE app_users SET pin_salt = $2, pin_hash = $3, pin_updated_at = now(), failed_pin_attempts = 0, pin_locked_until = NULL, updated_at = now() WHERE id = $1`, [target.id, record.salt, record.hash]);
  if (target.role !== 'manager') await neonHttpQuery(`DELETE FROM app_sessions WHERE user_id = $1`, [target.id]);
  return send(res, 200, { saved: true, user: publicUser({ ...target, pin_salt: record.salt, pin_hash: record.hash }, { includePinDisplay: true }) });
}

async function removePin(req, res, body) {
  if (!(await requireManager(req, res))) return;
  const targetExternalKey = String(body.targetExternalKey || '').trim();
  const rows = await neonHttpQuery(`SELECT id, external_key, name, role, pin_salt, pin_hash FROM app_users WHERE external_key = $1 AND is_active = true LIMIT 1`, [targetExternalKey]);
  if (!rows.length) return send(res, 404, { error: 'User not found.', code: 'user_not_found' });
  if (rows[0].role === 'manager') return send(res, 400, { error: 'Manager PIN cannot be removed from the UI.', code: 'manager_pin_protected' });
  await neonHttpQuery(`UPDATE app_users SET pin_salt = NULL, pin_hash = NULL, pin_updated_at = now(), failed_pin_attempts = 0, pin_locked_until = NULL, updated_at = now() WHERE id = $1`, [rows[0].id]);
  await neonHttpQuery(`DELETE FROM app_sessions WHERE user_id = $1`, [rows[0].id]);
  return send(res, 200, { removed: true, user: publicUser({ ...rows[0], pin_salt: null, pin_hash: null }, { includePinDisplay: true }) });
}

async function syncUser(req, res, body) {
  if (!(await requireManager(req, res))) return;
  const externalKey = String(body.externalKey || '').trim();
  const name = String(body.name || '').trim();
  if (!isValidExternalKey(externalKey) || !name || name.length > 120 || externalKey === 'manager') return send(res, 400, { error: 'A valid employee key and name are required.', code: 'invalid_user_payload' });
  const existing = await neonHttpQuery(`SELECT id, external_key, name, role, pin_salt, pin_hash FROM app_users WHERE external_key = $1 LIMIT 1`, [externalKey]);
  let rows;
  if (existing.length && existing[0].pin_hash && existing[0].pin_salt) {
    rows = await neonHttpQuery(`UPDATE app_users SET name = $2, role = 'employee', is_active = true, updated_at = now() WHERE id = $1 RETURNING external_key, name, role, pin_salt, pin_hash`, [existing[0].id, name]);
  } else {
    const record = makePinRecord(DEFAULT_PIN);
    if (existing.length) {
      rows = await neonHttpQuery(`UPDATE app_users SET name = $2, role = 'employee', is_active = true, pin_salt = $3, pin_hash = $4, pin_updated_at = now(), failed_pin_attempts = 0, pin_locked_until = NULL, updated_at = now() WHERE id = $1 RETURNING external_key, name, role, pin_salt, pin_hash`, [existing[0].id, name, record.salt, record.hash]);
    } else {
      rows = await neonHttpQuery(`INSERT INTO app_users (external_key, name, role, is_active, pin_salt, pin_hash, pin_updated_at) VALUES ($1, $2, 'employee', true, $3, $4, now()) RETURNING external_key, name, role, pin_salt, pin_hash`, [externalKey, name, record.salt, record.hash]);
    }
  }
  return send(res, 200, { synced: true, user: publicUser(rows[0], { includePinDisplay: true }) });
}

async function logout(req, res) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (token) await neonHttpQuery(`DELETE FROM app_sessions WHERE token_hash = $1`, [tokenHash(token)]);
  clearSessionCookie(res);
  return send(res, 200, { authenticated: false });
}

async function handleGet(req, res) {
  const url = requestUrl(req);
  const action = String(url.searchParams.get('action') || 'status').trim();
  if (action === 'users') {
    const users = await listUsers();
    const session = await currentSession(req);
    return send(res, 200, { users, session, managerPinConfigured: users.some(user => user.role === 'manager' && user.pinConfigured) });
  }
  if (action === 'adminUsers') {
    const manager = await requireManager(req, res);
    if (!manager) return;
    const users = await listUsers({ includePinDisplay: true });
    return send(res, 200, { users, session: manager, defaultPin: DEFAULT_PIN, pinDigits: PIN_DIGITS });
  }
  if (action === 'session') return send(res, 200, { session: await currentSession(req) });
  if (action === 'status') {
    const users = await listUsers();
    return send(res, 200, {
      configured: databaseConfigured(),
      mode: 'server-pin-auth-v1',
      managerPinConfigured: users.some(user => user.role === 'manager' && user.pinConfigured),
      bootstrapEnabled: false,
      pinDigits: PIN_DIGITS,
      lockout: { maxAttempts: MAX_ATTEMPTS, seconds: LOCK_SECONDS },
      sessionHours: SESSION_HOURS
    });
  }
  return send(res, 400, { error: 'Unsupported authentication action.', code: 'unsupported_action' });
}

async function handlePost(req, res) {
  if (!sameOriginWrite(req)) return send(res, 403, { error: 'Cross-origin authentication writes are not allowed.', code: 'cross_origin_write' });
  const body = await readBody(req);
  const action = String(body?.action || '').trim();
  if (action === 'login') return login(req, res, body);
  if (action === 'setPin') return setPin(req, res, body);
  if (action === 'removePin') return removePin(req, res, body);
  if (action === 'syncUser') return syncUser(req, res, body);
  if (action === 'logout') return logout(req, res);
  return send(res, 400, { error: 'Unsupported authentication action.', code: 'unsupported_action' });
}

export default async function handler(req, res) {
  try {
    if (!databaseConfigured()) return send(res, 503, { error: 'Authentication backend is not configured.', code: 'database_not_configured' });
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    return send(res, 405, { error: 'Method not allowed.', code: 'method_not_allowed' });
  } catch (error) {
    console.error('[B2B Sales Auth]', error);
    return send(res, error?.status || 500, { error: error?.message || 'Unexpected authentication error.', code: error?.code || 'authentication_error' });
  }
}
