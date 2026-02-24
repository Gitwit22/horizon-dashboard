# Job Control System — Horizon

## Overview

Job control prevents main-thread blocking and enables recovery from frozen workers.

**3 Hard Rules:**
- **Rule A**: Subagents must be non-blocking
- **Rule B**: Heartbeat watchdog (10s timeout)
- **Rule C**: Job control commands (list, status, cancel)

---

## Rule A — Subagent Non-Blocking

When spawning a subagent:
1. Write job metadata to `horizon/runtime/jobs/pending/<jobId>.json`
2. Return control to user **immediately** (don't await)
3. Subagent runs in background, writes results to `horizon/runtime/jobs/completed/<jobId>.json`
4. Main session polls or gets notified when done

### Job Metadata (pending/<jobId>.json)

```json
{
  "jobId": "j_a3f1b2c4",
  "createdAt": "2026-02-24T00:15:00Z",
  "type": "subagent",
  "status": "pending",
  "priority": "normal",
  "agentId": "builder",
  "task": "Build feature X",
  "timeout": 300,
  "sessionKey": "user:main:session123",
  "requiresApproval": false
}
```

### Job Result (completed/<jobId>.json)

```json
{
  "jobId": "j_a3f1b2c4",
  "createdAt": "2026-02-24T00:15:00Z",
  "completedAt": "2026-02-24T00:18:30Z",
  "status": "completed",
  "exitCode": 0,
  "result": { "filesWritten": 3, "commits": 1 },
  "error": null
}
```

---

## Rule B — Heartbeat Watchdog

The gateway heartbeat loop must emit a "heartbeat" log/event every 5–10 seconds.

If no heartbeat for >10 seconds:
1. Log stack trace of current job
2. Cancel current job
3. Restart the worker thread (graceful recovery)
4. Alert operator

### Heartbeat Log Entry

```json
{
  "type": "heartbeat",
  "timestamp": "2026-02-24T00:15:00Z",
  "workerId": "w_1",
  "activeJobs": 1,
  "uptime": 3600,
  "memoryMb": 512
}
```

### Watchdog Trigger

If (now - lastHeartbeat) > 10s:
```
CRITICAL: Heartbeat missed. Stack: [dump]. Restarting worker.
```

---

## Rule C — Job Control Commands

Implement these commands to regain control without killing the gateway:

### `jobs list`

```bash
node horizon/tools/jobs/ctl.js list [--status pending|completed|failed]
```

Output:
```
ID            Status      Type        Created              Priority
j_a3f1b2c4    pending     subagent    2026-02-24 00:15     normal
j_b7d3e9f1    completed   skill       2026-02-24 00:10     high
j_c2k8m5p9    failed      subagent    2026-02-24 00:05     normal
```

### `jobs status <jobId>`

```bash
node horizon/tools/jobs/ctl.js status j_a3f1b2c4
```

Output:
```json
{
  "jobId": "j_a3f1b2c4",
  "status": "pending",
  "elapsed": 45,
  "timeout": 300,
  "progress": "Running phase 1/3...",
  "canCancel": true
}
```

### `jobs cancel <jobId>`

```bash
node horizon/tools/jobs/ctl.js cancel j_a3f1b2c4 [--force]
```

Gracefully cancels the job. `--force` kills immediately.

---

## Implementation Checklist

- [ ] Create `horizon/runtime/jobs/{pending,completed,failed}` directories
- [ ] Implement job lifecycle: pending → running → completed/failed
- [ ] Add heartbeat emitter to gateway main loop
- [ ] Add watchdog timer (10s timeout)
- [ ] Implement `jobs list|status|cancel` CLI
- [ ] Update `sessions_spawn` to write pending jobs instead of awaiting
- [ ] Add stack trace capture on watchdog trigger
- [ ] Add job recovery scan on startup

---

## Recovery After Restart

After gateway restart:
1. Scan `pending/` directory
2. For each job with elapsed > 2 × timeout: mark as `failed`
3. For each job with elapsed < 2 × timeout: retry or resume
4. Log recovery actions to `horizon/runtime/logs/recovery-<date>.jsonl`

---

## Metrics

Track in telemetry:
- Total jobs spawned / completed / failed
- Average job duration
- Heartbeat miss rate
- Watchdog restarts
- Job cancellation rate
