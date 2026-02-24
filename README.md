# Horizon Agent Workspace

**Location:** C:\Users\klaws\clawd\  
**Owner:** John Steele  
**Agent:** Horizon (Clawdbot + Horizon Router)

---

## Structure

```
clawd/
â”œâ”€â”€ Core Config
â”‚   â”œâ”€â”€ SOUL.md                      â† Agent identity
â”‚   â”œâ”€â”€ AGENTS.md                    â† Operating instructions
â”‚   â”œâ”€â”€ USER.md                      â† Human context
â”‚   â”œâ”€â”€ IDENTITY.md                  â† Agent details
â”‚   â”œâ”€â”€ TOOLS.md                     â† Local config
â”‚   â”œâ”€â”€ HEARTBEAT.md                 â† Heartbeat tasks
â”‚   â”œâ”€â”€ MEMORY.md                    â† Long-term memory
â”‚   â””â”€â”€ SKILL-BUILDER-CONTEXT.md     â† System architecture
â”‚
â”œâ”€â”€ Code
â”‚   â”œâ”€â”€ command-router-v2.js         â† Active router
â”‚   â”œâ”€â”€ router-entry.js              â† Entry point
â”‚   â”œâ”€â”€ router.js                    â† Wrapper
â”‚   â”œâ”€â”€ startup-self-test.js         â† Production test
â”‚   â””â”€â”€ package.json                 â† Dependencies
â”‚
â”œâ”€â”€ Directories
â”‚   â”œâ”€â”€ router/                      â† Router subsystems
â”‚   â”œâ”€â”€ skills/                      â† Skill packages
â”‚   â”œâ”€â”€ runtime/                     â† Runtime state
â”‚   â”œâ”€â”€ scripts/                     â† Test scripts
â”‚   â”œâ”€â”€ memory/                      â† Daily logs
â”‚   â”œâ”€â”€ docs/                        â† Documentation
â”‚   â”‚   â””â”€â”€ history/                 â† Historical status docs
â”‚   â””â”€â”€ archive/                     â† Archived code
```

---

## Skills (5 Executable)

1. **system** - Filesystem, shell, sysinfo
2. **docgen** - Document generation (.docx)
3. **ziptrainer** - Skill package ingestion
4. **telemetry** - Usage analytics
5. **gmail** - Email sending with approval

---

## Integration

**Clawdbot Gateway:** `C:\Users\klaws\.clawdbot\gateway-wrapper.js`  
**Routes to:** Horizon Router (command-router-v2.js)  
**Protocol:** Skill-first routing with LLM fallback

---

## Auth Profile & Failover Incidents

If agent locks or cycles providers unexpectedly, see [INCIDENT-RECOVERY.md](INCIDENT-RECOVERY.md).

**Quick triage:**
```bash
node scripts/auth-status.js
```

This shows cooldown state, auth validity, and ETA to recovery for all providers.

**Emergency reset (rate-limit cooldowns only):**
```bash
node scripts/auth-reset-cooldowns.js --provider anthropic
```

**Greppable auth logs** (search for `[auth_` in runtime logs):
- `[auth_attempt provider=... profile=...]` — Attempting to set up a profile
- `[auth_result provider=... profile=... status=success|cooldown|auth status=...]` — Result state
- `[auth_fallback from=... to=... reason=...]` — Rotating to next profile

See [INCIDENT-RECOVERY.md](INCIDENT-RECOVERY.md#log-grepping) for examples.

---

## Horizon connectivity troubleshooting

If Horizon stops responding, run one command:

```bash
node scripts/agent-health.js horizon
```

What this checks:
- Current Horizon runtime health state (online/degraded/offline)
- Circuit-breaker state and consecutive transport failures
- Last heartbeat/response timestamps
- Gateway URL and whether token auth is configured
- Gateway health endpoint reachability (`/health` by default)

Runtime diagnostics are written to:
- `horizon/runtime/diag/agent-connectivity.jsonl`
- `horizon/runtime/diag/horizon-health.json`

Gateway config (single source in env):
- `GATEWAY_URL`
- `GATEWAY_PORT`
- `GATEWAY_TOKEN`
- `GATEWAY_AUTH_HEADER` (default: `Authorization`)
- `GATEWAY_HEALTH_PATH` (default: `/health`)

On startup Horizon logs:

```text
Gateway: http://127.0.0.1:18789 auth=token present=yes|no
```

---

## Recent Changes

**2026-02-21:** System cleanup
- Archived 20 status documents
- Removed duplicate skill zips
- Archived legacy router
- Cleaned stale approvals

**2026-02-20:** Major infrastructure upgrade
- Implemented Horizon Router v2
- Skill-first gate with hard rules
- Approval system
- Audit logging
- Gmail integration

---

*Clean workspace. Ready for production.*
