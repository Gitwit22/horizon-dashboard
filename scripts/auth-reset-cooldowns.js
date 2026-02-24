#!/usr/bin/env node

const path = require('path');
const { pathToFileURL } = require('url');

function parseArg(name, fallback = null) {
  const idx = process.argv.findIndex((a) => a === name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

(async () => {
  const provider = (parseArg('--provider', 'anthropic') || 'anthropic').trim().toLowerCase();

  const base = 'C:/Users/klaws/AppData/Roaming/npm/node_modules/clawdbot/dist';
  const authProfilesMod = await import(pathToFileURL(path.join(base, 'agents/auth-profiles.js')).href);

  const store = authProfilesMod.ensureAuthProfileStore(undefined, { allowKeychainPrompt: false });
  const profileIds = Object.entries(store.profiles)
    .filter(([, profile]) => String(profile.provider || '').toLowerCase() === provider)
    .map(([id]) => id);

  let cleared = 0;
  for (const profileId of profileIds) {
    const before = store.usageStats?.[profileId];
    if (!before?.cooldownUntil) continue;

    await authProfilesMod.clearAuthProfileCooldown({
      store,
      profileId,
      agentDir: undefined,
    });
    cleared += 1;
  }

  console.log(JSON.stringify({
    ok: true,
    provider,
    profilesSeen: profileIds.length,
    cooldownsCleared: cleared,
    note: 'auth_invalid flags are preserved by design',
  }, null, 2));
})();
