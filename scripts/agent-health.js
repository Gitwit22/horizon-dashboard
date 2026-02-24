#!/usr/bin/env node

const http = require('http');
const https = require('https');
const path = require('path');

const { getHealth } = require(path.resolve(__dirname, '..', 'horizon', 'runtime', 'connectivity', 'agentConnectivity'));
const { loadGatewayConfig } = require(path.resolve(__dirname, '..', 'horizon', 'runtime', 'config', 'gateway'));

function requestJson(url, timeoutMs = 2500, headers = {}) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const client = u.protocol === 'https:' ? https : http;
      const req = client.request(
        {
          method: 'GET',
          hostname: u.hostname,
          port: u.port,
          path: u.pathname + (u.search || ''),
          headers,
          timeout: timeoutMs,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => {
            let parsed = null;
            try {
              parsed = body ? JSON.parse(body) : null;
            } catch {
              parsed = body || null;
            }
            resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, statusCode: res.statusCode, body: parsed });
          });
        }
      );

      req.on('timeout', () => {
        req.destroy(new Error('timeout'));
      });

      req.on('error', (err) => {
        resolve({ ok: false, error: err.message });
      });

      req.end();
    } catch (err) {
      resolve({ ok: false, error: err.message });
    }
  });
}

async function main() {
  const agentName = (process.argv[2] || 'horizon').toLowerCase();
  if (agentName !== 'horizon') {
    console.error(JSON.stringify({ ok: false, error: `Unsupported agent: ${agentName}` }, null, 2));
    process.exit(1);
  }

  const state = getHealth();
  const gateway = loadGatewayConfig();

  const headers = {};
  if (gateway.tokenPresent) {
    headers[gateway.authHeaderName] = gateway.token.startsWith('Bearer ') ? gateway.token : `Bearer ${gateway.token}`;
  }

  const ping = await requestJson(`${gateway.url}${gateway.healthPath}`, 2500, headers);

  const result = {
    ok: state.status !== 'OFFLINE' && !state.breakerOpen,
    agent: state.agentName || 'horizon',
    status: state.status,
    breakerOpen: state.breakerOpen,
    consecutiveFailures: state.consecutiveFailures,
    lastHeartbeatAt: state.lastHeartbeatAt,
    lastResponseAt: state.lastResponseAt,
    lastSuccessfulAt: state.lastSuccessfulAt,
    lastDisconnectReason: state.lastDisconnectReason,
    version: state.version,
    gateway: {
      url: gateway.url,
      tokenPresent: gateway.tokenPresent,
      healthPath: gateway.healthPath,
      reachable: ping.ok,
      statusCode: ping.statusCode || null,
      error: ping.error || null,
    },
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 2);
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
