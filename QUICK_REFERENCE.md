# Quick Reference — Horizon Operations

## Metrics & Reporting

### End-of-Day Report
```bash
node horizon/tools/report/llm-attribution.js --days 1
```
→ Saves to: `horizon/runtime/datasets/llm-interactions/eod-YYYY-MM-DD.json`

**Key metrics:** Anthropic share, fallback rate, provider mix, execution times

### Week-End Report
```bash
node horizon/tools/report/llm-attribution.js --days 7
```
→ Saves to: `horizon/runtime/datasets/llm-interactions/wnd-YYYY-Www.json`

### Custom Window
```bash
node horizon/tools/report/llm-attribution.js --from 2026-02-20 --to 2026-02-24
```

---

## Job Control

### List All Jobs
```bash
node horizon/tools/jobs/ctl.js list
```

### Filter by Status
```bash
node horizon/tools/jobs/ctl.js list --status pending
node horizon/tools/jobs/ctl.js list --status completed
node horizon/tools/jobs/ctl.js list --status failed
```

### Check Job Status
```bash
node horizon/tools/jobs/ctl.js status j_a3f1b2c4
```

### Cancel Job (Graceful)
```bash
node horizon/tools/jobs/ctl.js cancel j_a3f1b2c4
```

### Force Cancel
```bash
node horizon/tools/jobs/ctl.js cancel j_a3f1b2c4 --force
```

---

## Key Directories

```
horizon/
├── runtime/
│   ├── jobs/
│   │   ├── pending/       # Active jobs
│   │   ├── completed/     # Finished successfully
│   │   └── failed/        # Failed or cancelled
│   ├── logs/
│   │   ├── heartbeat-*.jsonl
│   │   └── recovery-*.jsonl
│   ├── metrics/
│   └── datasets/
│       └── llm-interactions/  # EOD/WND reports
├── tools/
│   ├── report/
│   │   └── llm-attribution.js
│   └── jobs/
│       └── ctl.js
```

---

## Signals to Watch

### Anthropic Starvation
If Anthropic share drops below 60%:
- Local LLM is compensating
- Check if Anthropic quota/limits are hit
- Review recent fallbacks

### High Fallback Rate
If fallback rate > 10%:
- System degradation
- Model outages
- Rate limiting in effect

### Long Durations
If >20% of jobs take >5s:
- System load increasing
- Consider worker scaling
- Review job structure

### Missed Heartbeats
If watchdog triggers:
- Full stack trace logged
- Worker automatically restarts
- Check logs: `horizon/runtime/logs/recovery-*.jsonl`

---

## Recovery After Crash

### Check Git Status
```bash
cd projects/mejay
git status
git log --oneline -10
```

If you see new commits → work persisted ✅  
If commits are missing → work was in-memory (lost)

### Check Failed Jobs
```bash
node horizon/tools/jobs/ctl.js list --status failed
```

Review what failed and why. Retry manually if needed.

### View Watchdog Logs
```bash
cat horizon/runtime/logs/recovery-2026-02-24.jsonl | jq .
```

---

## Cron / Automation

### Schedule EOD Report
Add to cron:
```
0 17 * * * cd /path/to/clawd && node horizon/tools/report/llm-attribution.js --days 1
```

### Schedule WND Report
Add to cron (Friday 5 PM):
```
0 17 * * 5 cd /path/to/clawd && node horizon/tools/report/llm-attribution.js --days 7
```

Or via Clawdbot cron:
```
cron add --schedule "0 17 * * *" --text "eod"
```

---

## Standards Documents

- **STANDARDS.md** — Full operational standards (this framework)
- **AGENTS.md** — Rule A/B/C summary + agent behavior
- **horizon/runtime/jobs/SCHEMA.md** — Job metadata spec
- **HEARTBEAT.md** — Recurring checks for main session

