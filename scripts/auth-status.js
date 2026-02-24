#!/usr/bin/env node

const path = require('path');
const { pathToFileURL } = require('url');

function pad(value, width) {
  const text = String(value ?? '');
  return text.length >= width ? text : `${text}${' '.repeat(width - text.length)}`;
}

function fmtDate(ms) {
  if (!ms || !Number.isFinite(ms)) return '-';
  return new Date(ms).toISOString();
}

(async () => {
  const provider = (process.argv[2] || 'anthropic').trim().toLowerCase();

  const base = 'C:/Users/klaws/AppData/Roaming/npm/node_modules/clawdbot/dist';
  const authProfilesMod = await import(pathToFileURL(path.join(base, 'agents/auth-profiles.js')).href);
  const modelAuthMod = await import(pathToFileURL(path.join(base, 'agents/model-auth.js')).href);
  const configMod = await import(pathToFileURL(path.join(base, 'config/config.js')).href);

  const cfg = configMod.loadConfig();
  const store = authProfilesMod.ensureAuthProfileStore(undefined, { allowKeychainPrompt: false });
  const order = authProfilesMod.resolveAuthProfileOrder({ cfg, store, provider });

  const rows = [];

  for (const profileId of order) {
    const cred = store.profiles[profileId];
    if (!cred) continue;

    const stats = store.usageStats?.[profileId] || {};
    const now = Date.now();
    const cooldownUntil = Math.max(stats.cooldownUntil || 0, stats.disabledUntil || 0) || null;
    const secondsRemaining = cooldownUntil && cooldownUntil > now ? Math.ceil((cooldownUntil - now) / 1000) : 0;
    const inCooldown = authProfilesMod.isProfileInCooldown(store, profileId);

    const hasKey = cred.type === 'api_key'
      ? Boolean(cred.key && String(cred.key).trim())
      : cred.type === 'token'
      ? Boolean(cred.token && String(cred.token).trim())
      : Boolean((cred.access && String(cred.access).trim()) || (cred.refresh && String(cred.refresh).trim()));

    let status = 'available';
    let reason = '-';

    if (!hasKey) {
      status = 'unavailable';
      reason = 'missing_credentials';
    } else if (stats.disabledReason === 'auth_invalid') {
      status = 'invalid';
      reason = 'auth_invalid_401_403';
    } else if (inCooldown) {
      status = 'cooldown';
      reason = stats.disabledReason || 'rate_limit_or_timeout';
    }

    rows.push({
      provider,
      profile: profileId,
      enabled: 'yes',
      hasKey: hasKey ? 'yes' : 'no',
      status,
      reason,
      cooldownUntil: fmtDate(cooldownUntil),
      secondsRemaining,
    });
  }

  if (rows.length === 0) {
    const envKey = modelAuthMod.resolveEnvApiKey(provider);
    rows.push({
      provider,
      profile: `${provider}:env`,
      enabled: 'yes',
      hasKey: envKey?.apiKey ? 'yes' : 'no',
      status: envKey?.apiKey ? 'available' : 'unavailable',
      reason: envKey?.apiKey ? `env:${envKey.source}` : `missing_${provider.toUpperCase()}_API_KEY`,
      cooldownUntil: '-',
      secondsRemaining: 0,
    });
  }

  const header = ['provider', 'profile', 'enabled', 'hasKey', 'status', 'reason', 'cooldownUntil', 'secondsRemaining'];
  const widths = [12, 34, 8, 8, 12, 28, 28, 16];

  console.log(header.map((h, i) => pad(h, widths[i])).join(' | '));
  console.log(widths.map((w) => '-'.repeat(w)).join('-|-'));
  for (const row of rows) {
    console.log([
      pad(row.provider, widths[0]),
      pad(row.profile, widths[1]),
      pad(row.enabled, widths[2]),
      pad(row.hasKey, widths[3]),
      pad(row.status, widths[4]),
      pad(row.reason, widths[5]),
      pad(row.cooldownUntil, widths[6]),
      pad(row.secondsRemaining, widths[7]),
    ].join(' | '));
  }
})();
