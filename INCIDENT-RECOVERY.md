# Incident Recovery Playbook: Auth Profile Cooldown & Failover

**Quick reference for support/ops when authentication is locked or rotating unwillingly.**

---

## Symptoms to Watch

### Agent refuses to respond
```
FailoverError: No available auth profile for anthropic (all in cooldown or unavailable).
```

### Agent stuck on wrong model
Profile rotation happening when it shouldn't, or not rotating when expected.

### Unusual fallback behavior
Fallback to local/ollama when Anthropic should be available.

---

## Diagnostic Workflow (1 command)

```bash
node scripts/auth-status.js
```

**Output format:**
```
Provider: anthropic
  Profile: anthropic:prod
    Status: cooldown
    Reason: rate_limit_or_timeout
    Cooldown Until: 2026-02-24T10:15:32.000Z
    Remaining: 23s
    Error Count: 2
    Last Failure: (reason)

  Profile: anthropic:backup  
    Status: available
    Unused
```

**Interpret:**
- `status=available`: Profile is ready to use.
- `status=cooldown`: Profile temporarily unusable; will auto-recover after `Remaining` time.
- `reason=rate_limit_or_timeout`: Expected transient (cooldown will clear).
- `reason=auth_invalid`: Permanent auth failure (needs key rotation or credential fix).
- `reason=billing`: Billing issue; fix account, then reset.

---

## Recovery Workflow

### Step 1: Diagnose

```bash
node scripts/auth-status.js
```

**Check the output:**
- All profiles in `cooldown`? → Wait for remaining time OR reset cooldowns.
- At least one in `available`? → Agent should work next request.
- Profile stuck in `auth_invalid`? → Rotate auth key; see "Fix Auth" below.

---

### Step 2A: If rate-limited (429/503 storm)

**Quick reset (clears temp cooldowns only):**

```bash
node scripts/auth-reset-cooldowns.js --provider anthropic
```

**Output:**
```
{ ok: true, provider: "anthropic", profilesSeen: 2, cooldownsCleared: 1 }
```

**Why this works:**
- Clears `cooldownUntil` timestamps (temporary rate-limit holds).
- Preserves `auth_invalid` flags (permanent auth issues require key rotation).
- Safe to run any time; immediate effect.

---

### Step 2B: If permanently invalid (401/403)

**Do NOT reset cooldowns. Instead:**

1. Rotate auth keys:
   ```bash
   # Update credential in your auth profile store
   node scripts/auth-status.js          # Note which profile has auth_invalid
   # (Update CLAWDBOT_ANTHROPIC_KEY env var or profile file)
   ```

2. Once key is updated, agent will auto-clear `auth_invalid` on next success.
   - No manual cleanup needed.
   - First request after key fix may still fail briefly; second request will succeed.

---

### Step 3: Verify recovery

```bash
node scripts/auth-status.js
```

Check:
- At least one profile is `available`.
- Cooldown remaining is 0 or gone.

**Result:** Next request will use available profile.

---

## Log Grepping

Look for `[auth_*` lines in agent/Clawdbot logs:

### Auth attempt log
```
[auth_attempt provider=anthropic profile=anthropic:prod]
```
Fired when trying to set up auth for a profile.

### Auth result log
```
[auth_result provider=anthropic profile=anthropic:prod status=success retryAfter=none cooldownUntil=none]
[auth_result provider=anthropic profile=anthropic:prod status=rate_limit retryAfter=30 cooldownUntil=2026-02-24T10:15:32.000Z]
[auth_result provider=anthropic profile=anthropic:prod status=auth retryAfter=none cooldownUntil=none]
```
Fired after profile succeeds or fails. Shows the result state.

### Auth fallback log
```
[auth_fallback from=anthropic:prod to=anthropic:backup provider=anthropic reason=cooldown eta=23s]
```
Fired when rotating to next profile. Shows why and ETA to next available.

---

## Reference: Error Classification

| HTTP Status | Classification | Cooldown? | Fixable? |
|---|---|---|---|
| **401, 403** | `auth` | ❌ Sets `auth_invalid` (24h hold) | ✅ Rotate key |
| **429, 503, 529** | `rate_limit` | ✅ Cooldown 10s–1h | ✅ Wait or reset |
| **408** | `timeout` | ✅ Cooldown 8s | ✅ Wait or reset |
| **400** | `format` | ❌ No cooldown | ⚠️ Model/tool mismatch; check request |
| **500, others** | `unknown` | ❌ No cooldown | ⚠️ Investigate provider |

---

## Common Issues

### Agent logs show "all profiles in cooldown"
**Likely:** 429 storm from provider.  
**Fix:** Run `node scripts/auth-reset-cooldowns.js --provider anthropic`  
**Verify:** `node scripts/auth-status.js` → at least one profile is `available`.

### Agent logs show "auth_invalid"
**Likely:** Bad API key or expired credential.  
**Fix:** 
1. Check `CLAWDBOT_ANTHROPIC_KEY` env var exists and is correct.
2. Regenerate key in Anthropic console if needed.
3. Update env var or auth profile file.
4. Agent will auto-clear on next success.

### Agent uses local/ollama instead of expected provider
**Check:** Is Anthropic in `auth_invalid` for >30min?  
**Likely:** Fallback is active because Anthropic unavailable.  
**Fix:** Follow steps above to clear cooldown or rotate key, then next request routes back to Anthropic.

### Retry-After header not respected
**Unlikely but check:** If provider returned `Retry-After: <seconds>` but agent ignores it:  
**Root:** `parseRetryAfterSeconds` may need debugging.  
**Verify:** `node scripts/test-auth-failover.js` includes a Retry-After parse test; should pass.

---

## Prevention

### Monitor cooldown durations
If you see frequent `429 → cooldown` in logs, provider may be rate-limiting hard.  
**Action:** Consider increasing request spacing or adding delays between agent calls.

### Watch for auth_invalid spikes
Multiple profiles hitting `auth_invalid` in same window → credential compromise or mass key rotation.  
**Action:** Audit recent credential changes.

### Cooldown cap sanity
Persisted cooldowns are capped at **5 minutes max**. If you see longer, check that store sanitization is running on load.  
**Verify:** `node scripts/test-auth-failover.js` confirms edge cases; check "edge-case-2" for far-future cap.

---

## Tools

### `node scripts/auth-status.js`
- **What:** Tabular view of all providers and their profiles.
- **When:** Diagnose cooldown/auth state.
- **Result:** JSON or pretty-printed status.

### `node scripts/auth-reset-cooldowns.js`
- **What:** Clear rate-limit cooldowns for a provider.
- **When:** Emergency reset after 429 storm.
- **Safety:** Preserves `auth_invalid` (permanent) flags.
- **Usage:**
  ```bash
  node scripts/auth-reset-cooldowns.js --provider anthropic
  node scripts/auth-reset-cooldowns.js --provider openai
  ```

### `node scripts/test-auth-failover.js`
- **What:** Test suite for classification + ordering + edge cases.
- **When:** Verify auth logic after changes.
- **Result:** "✅ ALL PASS" or failure output.

---

## Invariants (Guaranteed by Tests)

✅ **401/403 never sets cooldown.** Only `disabledReason=auth_invalid`.  
✅ **429/503/529 always sets cooldown** and respects `Retry-After` header.  
✅ **400 validation errors never set cooldown** and never flip `auth_invalid`.  

If any fail, test suite exits loudly. Run `test-auth-failover.js` after any auth logic changes.

---

## Escalation

If none of the above resolve:

1. Collect logs with `[auth_` prefix:
   ```bash
   grep -E '\[auth_' /path/to/logs/*.log | tail -100
   ```

2. Run `node scripts/auth-status.js` and save output.

3. Check agent runtime at:
   ```
   C:\Users\klaws\AppData\Roaming\npm\node_modules\clawdbot\dist\agents\
       auth-profiles\usage.js         (cooldown logic)
       auth-profiles\order.js         (profile ordering)
       pi-embedded-runner\run.js      (main failover loop + logging)
   ```

4. File issue with:
   - Exact error message
   - Auth status output
   - Logs grep results
   - Steps to reproduce

---

*Last updated: 2026-02-24*  
*Tested by: test-auth-failover.js (3 invariants + 4 edge cases)*
