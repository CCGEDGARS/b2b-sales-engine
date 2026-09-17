const CONNECTION_ENV = 'B2B_NEON_DATABASE_URL';
const LEGACY_CONNECTION_ENV = 'EINSTEIN_NEON_DATABASE_URL';
const LEGACY_COMPAT_ENV = 'EINSTEIN_NEON_DATABASE_UR';
const MAX_ERROR_TEXT = 1200;

function configuredConnectionString() {
  return String(
    process.env[CONNECTION_ENV]
    || process.env[LEGACY_CONNECTION_ENV]
    || process.env[LEGACY_COMPAT_ENV]
    || ''
  ).trim();
}

function connectionString() {
  const value = configuredConnectionString();
  if (!value) {
    const error = new Error(`${CONNECTION_ENV} is not configured on the server.`);
    error.code = 'database_not_configured';
    error.status = 503;
    throw error;
  }
  return value;
}

function neonEndpoint(value) {
  let parsed;
  try { parsed = new URL(value); }
  catch {
    const error = new Error('Database connection string is invalid.');
    error.code = 'invalid_database_configuration';
    error.status = 500;
    throw error;
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.username || !parsed.hostname || !parsed.pathname) {
    const error = new Error('Database connection string has an unsupported format.');
    error.code = 'invalid_database_configuration';
    error.status = 500;
    throw error;
  }
  if (!parsed.hostname.endsWith('.neon.tech')) {
    const error = new Error('Shared-state backend must use a configured Neon database.');
    error.code = 'invalid_database_host';
    error.status = 500;
    throw error;
  }
  const apiHost = parsed.hostname.replace(/^[^.]+\./, 'api.');
  return `https://${apiHost}/sql`;
}

function prepareParam(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function rowsFromRaw(result) {
  const fields = Array.isArray(result?.fields) ? result.fields : [];
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  const names = fields.map(field => String(field?.name || ''));
  return rows.map(row => Object.fromEntries((Array.isArray(row) ? row : []).map((value, index) => [names[index], value])));
}

export async function neonHttpQuery(query, params = [], { signal } = {}) {
  const conn = connectionString();
  const response = await fetch(neonEndpoint(conn), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Neon-Connection-String': conn,
      'Neon-Raw-Text-Output': 'true',
      'Neon-Array-Mode': 'true'
    },
    body: JSON.stringify({ query, params: params.map(prepareParam) }),
    signal
  });
  if (!response.ok) {
    let message = '';
    try {
      const payload = await response.json();
      message = payload?.message || payload?.detail || payload?.error || '';
    } catch {
      message = (await response.text().catch(() => '')).slice(0, MAX_ERROR_TEXT);
    }
    const error = new Error(String(message || `Neon query failed with HTTP ${response.status}.`));
    error.code = 'database_query_failed';
    error.status = response.status >= 500 ? 502 : 500;
    throw error;
  }
  const result = await response.json();
  return rowsFromRaw(result);
}

export function databaseConfigured() {
  return Boolean(configuredConnectionString());
}
