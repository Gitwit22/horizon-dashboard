const fs = require('fs');
const path = require('path');

let startupLogged = false;

function safeReadCanonicalPort() {
  try {
    const canonicalPath = path.resolve(__dirname, '..', '..', '..', 'config', 'CANONICAL.json');
    if (!fs.existsSync(canonicalPath)) return 18789;
    const raw = fs.readFileSync(canonicalPath, 'utf8');
    const parsed = JSON.parse(raw);
    const port = Number(parsed?.gateway?.port);
    return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 18789;
  } catch {
    return 18789;
  }
}

function safeReadClawdbotGatewayConfig() {
  try {
    const clawCfgPath = 'C:/Users/klaws/.clawdbot/clawdbot.json';
    if (!fs.existsSync(clawCfgPath)) return null;
    const raw = fs.readFileSync(clawCfgPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      port: Number(parsed?.gateway?.port),
      token: (parsed?.gateway?.auth?.token || '').trim(),
    };
  } catch {
    return null;
  }
}

function parsePort(input, fallback) {
  const n = Number(input);
  if (!Number.isInteger(n) || n <= 0 || n > 65535) return fallback;
  return n;
}

function loadGatewayConfig() {
  const clawGateway = safeReadClawdbotGatewayConfig();
  const defaultPort = Number.isInteger(clawGateway?.port) ? clawGateway.port : safeReadCanonicalPort();
  const envPort = parsePort(process.env.GATEWAY_PORT, defaultPort);
  const envUrl = process.env.GATEWAY_URL || `http://127.0.0.1:${envPort}`;

  let parsedUrl;
  try {
    parsedUrl = new URL(envUrl);
  } catch {
    throw new Error(`Invalid GATEWAY_URL: ${envUrl}`);
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error(`Unsupported GATEWAY_URL protocol: ${parsedUrl.protocol}`);
  }

  const port = parsePort(parsedUrl.port || envPort, defaultPort);
  const token = (process.env.GATEWAY_TOKEN || process.env.CLAWDBOT_GATEWAY_TOKEN || clawGateway?.token || '').trim();

  return {
    url: `${parsedUrl.protocol}//${parsedUrl.hostname}:${port}`,
    port,
    token,
    tokenPresent: token.length > 0,
    authHeaderName: process.env.GATEWAY_AUTH_HEADER || 'Authorization',
    healthPath: process.env.GATEWAY_HEALTH_PATH || '/health',
  };
}

function logGatewayStartup(config) {
  if (startupLogged) return;
  startupLogged = true;
  console.log(`Gateway: ${config.url} auth=token present=${config.tokenPresent ? 'yes' : 'no'}`);
  if (!config.tokenPresent) {
    console.warn('[Gateway] Token missing (GATEWAY_TOKEN/CLAWDBOT_GATEWAY_TOKEN). Set one to avoid auth mismatch failures.');
  }
}

module.exports = {
  loadGatewayConfig,
  logGatewayStartup,
};
