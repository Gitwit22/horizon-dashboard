#!/usr/bin/env node

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const base = 'C:/Users/klaws/AppData/Roaming/npm/node_modules/clawdbot/dist';
  const usageMod = await import(pathToFileURL(path.join(base, 'agents/auth-profiles/usage.js')).href);
  const orderMod = await import(pathToFileURL(path.join(base, 'agents/auth-profiles/order.js')).href);

  console.log('[invariant-1] Testing 401/403: classifies as "auth" only');
  // 401/403 MUST classify as "auth" only
  assert.strictEqual(usageMod.classifyProfileFailureReason({ status: 401, reason: 'unknown' }), 'auth');
  assert.strictEqual(usageMod.classifyProfileFailureReason({ status: 403, reason: 'rate_limit' }), 'auth');
  assert.strictEqual(usageMod.classifyProfileFailureReason({ status: 403, reason: 'unknown' }), 'auth');
  console.log('✓ invariant-1 PASS: 401/403 classify as "auth"');

  console.log('[invariant-2] Testing 429/503/529: classifies as "rate_limit" only');
  // 429/503/529 MUST classify as "rate_limit" only
  assert.strictEqual(usageMod.classifyProfileFailureReason({ status: 429, reason: 'unknown' }), 'rate_limit');
  assert.strictEqual(usageMod.classifyProfileFailureReason({ status: 503, reason: 'unknown' }), 'rate_limit');
  assert.strictEqual(usageMod.classifyProfileFailureReason({ status: 529, reason: 'unknown' }), 'rate_limit');
  assert.strictEqual(usageMod.classifyProfileFailureReason({ status: 429, reason: 'auth' }), 'rate_limit', 'FAIL: 429 overrides reason to rate_limit');
  console.log('✓ invariant-2 PASS: 429/503/529 classify as "rate_limit"');

  console.log('[invariant-3] Testing 400: classifies as "format" only');
  // 400 MUST classify as "format" only
  assert.strictEqual(usageMod.classifyProfileFailureReason({ status: 400, reason: 'unknown' }), 'format');
  assert.strictEqual(usageMod.classifyProfileFailureReason({ status: 400, reason: 'rate_limit' }), 'format', 'FAIL: 400 overrides to format');
  console.log('✓ invariant-3 PASS: 400 classifies as "format"');

  console.log('[edge-case-1] Testing Retry-After parsing');
  // Numeric Retry-After
  assert.strictEqual(usageMod.parseRetryAfterSeconds({ headers: { 'retry-after': '12' } }), 12);
  assert.strictEqual(usageMod.parseRetryAfterSeconds({ headers: { 'Retry-After': '30' } }), 30);
  // Invalid Retry-After defaults to 10s
  assert.strictEqual(usageMod.parseRetryAfterSeconds({ headers: { 'Retry-After': 'junk' } }), 10);
  // Missing Retry-After returns null
  assert.strictEqual(usageMod.parseRetryAfterSeconds({ headers: {} }), null);
  console.log('✓ edge-case-1 PASS: Retry-After parsing (numeric, invalid, missing)');

  console.log('[edge-case-2] Testing cooldown calculation');
  // cooldown capping: error count 1 = 60s, count 10 = 1h max
  assert.strictEqual(usageMod.calculateAuthProfileCooldownMs(1), 60_000);
  assert.strictEqual(usageMod.calculateAuthProfileCooldownMs(2), 300_000); // 5min
  assert.strictEqual(usageMod.calculateAuthProfileCooldownMs(10), 3_600_000); // 1h
  console.log('✓ edge-case-2 PASS: Cooldown calculation increasing by exponential backoff');

  console.log('[edge-case-3] Testing isProfileInCooldown with past timestamp');
  const now = Date.now();
  const pastStore = {
    profiles: { 'test:a': { provider: 'test', type: 'api_key', key: 'k1' } },
    usageStats: {
      'test:a': { cooldownUntil: now - 5_000, errorCount: 2 },
    },
  };
  // Past cooldown should be available (not in cooldown)
  const inCooldown = usageMod.isProfileInCooldown(pastStore, 'test:a');
  assert.strictEqual(inCooldown, false, 'FAIL: past cooldown timestamp should return available (not in cooldown)');
  console.log('✓ edge-case-3 PASS: Past cooldown treated as available');

  console.log('[edge-case-4] Testing isProfileInCooldown with future timestamp');
  const futureStore = {
    profiles: { 'test:b': { provider: 'test', type: 'api_key', key: 'k2' } },
    usageStats: {
      'test:b': { cooldownUntil: now + 30_000, errorCount: 1 },
    },
  };
  // Future cooldown should be in cooldown
  const futureCooldown = usageMod.isProfileInCooldown(futureStore, 'test:b');
  assert.strictEqual(futureCooldown, true, 'FAIL: future cooldown timestamp should return in cooldown');
  console.log('✓ edge-case-4 PASS: Future cooldown correctly detected');

  console.log('[ordering] Testing profile order resolution');
  // ordering: available before cooldown, cooldown sorted by earliest expiry
  const orderNow = Date.now();
  const orderStore = {
    profiles: {
      'anthropic:a': { provider: 'anthropic', type: 'api_key', key: 'k1' },
      'anthropic:b': { provider: 'anthropic', type: 'api_key', key: 'k2' },
      'anthropic:c': { provider: 'anthropic', type: 'api_key', key: 'k3' },
    },
    usageStats: {
      'anthropic:b': { cooldownUntil: orderNow + 50_000 },
      'anthropic:c': { cooldownUntil: orderNow + 10_000 },
    },
    order: { anthropic: ['anthropic:a', 'anthropic:b', 'anthropic:c'] },
  };

  const order = orderMod.resolveAuthProfileOrder({ cfg: {}, store: orderStore, provider: 'anthropic' });
  assert.strictEqual(order[0], 'anthropic:a', 'FAIL: available should be first');
  assert.strictEqual(order[1], 'anthropic:c', 'FAIL: earliest cooldown should be second');
  assert.strictEqual(order[2], 'anthropic:b', 'FAIL: latest cooldown should be third');
  console.log('✓ ordering PASS: available first, then cooldown sorted by earliest expiry');

  console.log('[classification] Testing comprehensive error classification');
  assert.strictEqual(usageMod.classifyProfileFailureReason({ status: 401, reason: 'unknown' }), 'auth');
  assert.strictEqual(usageMod.classifyProfileFailureReason({ status: 403, reason: 'rate_limit' }), 'auth');
  assert.strictEqual(usageMod.classifyProfileFailureReason({ status: 429, reason: 'unknown' }), 'rate_limit');
  assert.strictEqual(usageMod.classifyProfileFailureReason({ status: 503, reason: 'unknown' }), 'rate_limit');
  assert.strictEqual(usageMod.classifyProfileFailureReason({ status: 529, reason: 'unknown' }), 'rate_limit');
  assert.strictEqual(usageMod.classifyProfileFailureReason({ status: 408, reason: 'unknown' }), 'timeout');
  assert.strictEqual(usageMod.classifyProfileFailureReason({ status: 400, reason: 'unknown' }), 'format');
  assert.strictEqual(usageMod.classifyProfileFailureReason({ status: 500, reason: 'unknown' }), 'unknown');
  assert.strictEqual(usageMod.classifyProfileFailureReason({ status: undefined, reason: 'billing' }), 'billing');
  console.log('✓ classification PASS: all error codes classified correctly');

  console.log('\n✅ auth failover tests: ALL PASS (3 invariants + 4 edge cases)');
})();
