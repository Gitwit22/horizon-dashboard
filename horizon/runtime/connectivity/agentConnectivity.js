const fs = require('fs');
const path = require('path');

const DIAG_DIR = path.resolve(__dirname, '..', 'diag');
const LOG_FILE = path.join(DIAG_DIR, 'agent-connectivity.jsonl');
const STATE_FILE = path.join(DIAG_DIR, 'horizon-health.json');

const DEFAULT_STATE = {
  agentName: 'horizon',
  status: 'ONLINE',
  lastHeartbeatAt: null,
  lastResponseAt: null,
  lastSuccessfulAt: null,
  lastDisconnectReason: null,
  consecutiveFailures: 0,
  breakerOpen: false,
  breakerOpenedAt: null,
  version: 'unknown',
  updatedAt: null,
};

let inMemoryState = { ...DEFAULT_STATE };

function ensureDiagDir() {
  fs.mkdirSync(DIAG_DIR, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDiagDir();
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function readState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return { ...DEFAULT_STATE };
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function persistState(partial) {
  const now = new Date().toISOString();
  const current = readState();
  const next = {
    ...current,
    ...partial,
    updatedAt: now,
  };
  inMemoryState = next;
  writeJson(STATE_FILE, next);
  return next;
}

function appendLog(event) {
  try {
    ensureDiagDir();
    fs.appendFileSync(LOG_FILE, `${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`, 'utf8');
  } catch (err) {
    console.error('[Connectivity] Failed to write log:', err.message);
  }
}

function isTransportError(error) {
  const msg = (error?.message || '').toLowerCase();
  const code = (error?.code || '').toUpperCase();

  const transportCodes = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'UND_ERR_CONNECT_TIMEOUT',
  ]);

  if (transportCodes.has(code)) return true;

  return (
    msg.includes('fetch failed') ||
    msg.includes('socket hang up') ||
    msg.includes('timed out') ||
    msg.includes('network error') ||
    msg.includes('connect')
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function recordHeartbeat(agentName = 'horizon', version = 'unknown') {
  persistState({
    agentName,
    version,
    status: 'ONLINE',
    lastHeartbeatAt: new Date().toISOString(),
  });
}

function markOffline(reason) {
  const prev = readState();
  const next = persistState({
    status: 'OFFLINE',
    lastDisconnectReason: reason,
  });
  appendLog({
    type: 'disconnect',
    reason,
    lastSuccessfulAt: prev.lastSuccessfulAt,
    status: next.status,
  });
}

function getHealth() {
  return readState();
}

async function invokeWithRetry(callFn, options = {}) {
  const {
    agentName = 'horizon',
    requestId = 'unknown',
    transport = 'gateway-http',
    url = 'unknown',
    maxRetries = 5,
    baseDelayMs = 250,
    maxDelayMs = 10_000,
    breakerFailureThreshold = 5,
    breakerCooldownMs = 30_000,
  } = options;

  const current = readState();
  if (current.breakerOpen && current.breakerOpenedAt) {
    const elapsed = Date.now() - new Date(current.breakerOpenedAt).getTime();
    if (elapsed < breakerCooldownMs) {
      const err = new Error(`Circuit breaker open for ${agentName}`);
      err.code = 'CIRCUIT_OPEN';
      throw err;
    }
    persistState({ breakerOpen: false, breakerOpenedAt: null, status: 'ONLINE' });
  }

  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetries) {
    const startedAt = Date.now();
    attempt += 1;

    appendLog({
      type: 'outbound_request',
      agentName,
      requestId,
      transport,
      url,
      attempt,
    });

    try {
      const result = await callFn();
      const latencyMs = Date.now() - startedAt;
      persistState({
        status: 'ONLINE',
        consecutiveFailures: 0,
        breakerOpen: false,
        breakerOpenedAt: null,
        lastResponseAt: new Date().toISOString(),
        lastSuccessfulAt: new Date().toISOString(),
        lastDisconnectReason: null,
      });

      appendLog({
        type: 'inbound_response',
        agentName,
        requestId,
        success: true,
        statusCode: 200,
        latencyMs,
        attempt,
      });

      return result;
    } catch (error) {
      lastError = error;
      const latencyMs = Date.now() - startedAt;
      const transportFailure = isTransportError(error);
      const nextFailures = (readState().consecutiveFailures || 0) + 1;

      persistState({
        status: transportFailure ? 'DEGRADED' : 'OFFLINE',
        consecutiveFailures: nextFailures,
        lastResponseAt: new Date().toISOString(),
        lastDisconnectReason: error?.message || 'unknown_error',
      });

      appendLog({
        type: 'inbound_response',
        agentName,
        requestId,
        success: false,
        statusCode: null,
        latencyMs,
        attempt,
        transportFailure,
        error: error?.message || String(error),
        stack: error?.stack || null,
      });

      if (!transportFailure || attempt > maxRetries) {
        if (nextFailures >= breakerFailureThreshold) {
          persistState({
            breakerOpen: true,
            breakerOpenedAt: new Date().toISOString(),
            status: 'OFFLINE',
          });
          markOffline(error?.message || 'circuit_breaker_opened');
        }
        throw error;
      }

      const delayMs = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      await sleep(delayMs);
    }
  }

  throw lastError || new Error('invokeWithRetry exhausted without explicit error');
}

module.exports = {
  invokeWithRetry,
  recordHeartbeat,
  markOffline,
  getHealth,
};
