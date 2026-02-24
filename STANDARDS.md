# STANDARDS.md — Horizon Agent Operating Standards

**Version:** 1.0  
**Last Updated:** 2026-02-24  
**Owner:** John Steele

---

## Overview

These are the **non-negotiable operational standards** for all agents and systems running under Horizon.

Three core problems we solve:
1. **Blocking subagents** freeze the main thread → Rule A: Non-blocking job model
2. **Frozen workers** don't fail gracefully → Rule B: Heartbeat watchdog
3. **Lost control** when things break → Rule C: Job control commands

---

## Rule A — Subagents Must Be Non-Blocking

**The Problem:** When spawning a subagent and awaiting it, if the subagent freezes or takes too long, the main thread blocks and the entire system becomes unresponsive.

**The Solution:** Write a pending job record, spawn the subagent in background, return control immediately.

### Implementation

When you call `sessions_spawn({ task, label })`:

```javascript
// Write pending job first
const jobId = genId("j_");
const jobRecord = {
  jobId,
  createdAt: now(),
  type: "subagent",
  status: "pending",
  agentId: "agent-id",
  task: "Description of task",
  timeout: 300, // seconds
  sessionKey: currentSession,
  priority: "normal"
};
fs.writeFileSync(`horizon/runtime/jobs/pending/${jobId}.json`, JSON.stringify(jobRecord));

// Spawn non-blocking
sessions_spawn({ task, label, jobId })
  .then(result => {
    // Job completed — write completion record
    jobRecord.status = "completed";
    jobRecord.completedAt = now();
    jobRecord.result = result;
    fs.writeFileSync(`horizon/runtime/jobs/completed/${jobId}.json`, JSON.stringify(jobRecord));
    // Notify user (optional — depends on workflow)
  })
  .catch(error => {
    // Job failed — write failure record
    jobRecord.status = "failed";
    jobRecord.error = error.message;
    fs.writeFileSync(`horizon/runtime/jobs/failed/${jobId}.json`, JSON.stringify(jobRecord));
  });

// Return control to user IMMEDIATELY
return `Job spawned: ${jobId}. Check status with: jobs status ${jobId}`;
```

### Job Metadata Schema

**Pending Job** (`horizon/runtime/jobs/pending/<jobId>.json`):
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

**Completed Job** (`horizon/runtime/jobs/completed/<jobId>.json`):
```json
{
  "jobId": "j_a3f1b2c4",
  "createdAt": "2026-02-24T00:15:00Z",
  "completedAt": "2026-02-24T00:18:30Z",
  "status": "completed",
  "type": "subagent",
  "result": { "filesWritten": 3, "commits": 1, "summary": "..." },
  "exitCode": 0
}
```

**Failed Job** (`horizon/runtime/jobs/failed/<jobId>.json`):
```json
{
  "jobId": "j_a3f1b2c4",
  "createdAt": "2026-02-24T00:15:00Z",
  "status": "failed",
  "type": "subagent",
  "error": "Timeout: No heartbeat for 10s",
  "exitCode": 1
}
```

### Workflow Pattern

```
User requests task
    ↓
Agent spawns subagent (non-blocking)
    ↓
Writes pending/<jobId>.json
    ↓
Returns "Job spawned: <jobId>" to user
    ↓
User continues (can check status anytime)
    ↓
Subagent runs in background
    ↓
On completion: writes completed/<jobId>.json
    ↓
Optional: ping user or auto-deliver result
```

---

## Rule B — Heartbeat Watchdog (10s Timeout)

**The Problem:** A frozen worker thread silently blocks, with no detection and no recovery.

**The Solution:** Emit heartbeat events regularly. If heartbeat stops, trigger immediate recovery.

### Heartbeat Mechanism

The gateway main loop must emit a heartbeat log every 5–10 seconds:

```json
{
  "type": "heartbeat",
  "timestamp": "2026-02-24T00:15:00Z",
  "workerId": "w_1",
  "activeJobs": 1,
  "uptime": 3600,
  "memoryMb": 512,
  "lastJobId": "j_a3f1b2c4"
}
```

### Watchdog Logic

The watchdog timer (separate from main loop) checks:

```
if (now - lastHeartbeat > 10 seconds):
    1. Log CRITICAL with full stack trace
    2. Dump current job state
    3. Move job from pending → failed
    4. Restart worker thread
    5. Alert operator (log to stderr)
```

### Example Alert Output

```
[CRITICAL] Heartbeat missed for worker w_1 (12.3s)
Current job: j_a3f1b2c4 (type=subagent, elapsed=8.5s)
Stack trace:
  at Task.run() in /horizon/session.js:42
  at Worker.loop() in /horizon/worker.js:108
  at process.on.message() in /horizon/gateway.js:224

Action: Restarting worker w_1
Failed job: j_a3f1b2c4 moved to horizon/runtime/jobs/failed/
```

### Integration Points

**Log file location:** `horizon/runtime/logs/heartbeat-<YYYY-MM-DD>.jsonl`

**Restart behavior:**
- Graceful: flush pending records, close connections, exit(1)
- Gateway: detect exit, spawn new worker with same ID
- State: jobs with elapsed < 2× timeout are retried; others marked failed

---

## Rule C — Job Control Commands

**The Problem:** When things go wrong, operators need visibility and control without killing the entire gateway.

**The Solution:** CLI tool to list, inspect, and cancel jobs.

### Commands

#### `jobs list [--status <pending|completed|failed>]`

Show all jobs (or filtered by status):

```bash
$ node horizon/tools/jobs/ctl.js list

╔════════════════════════════════════════════════════════════════╗
║ Jobs (all)                                                     ║
╚════════════════════════════════════════════════════════════════╝

ID            Status      Type        Created              Priority
j_a3f1b2c4    pending     subagent    2026-02-24 00:15     normal
j_b7d3e9f1    completed   skill       2026-02-24 00:10     high
j_c2k8m5p9    failed      subagent    2026-02-24 00:05     normal
```

#### `jobs status <jobId>`

Inspect a single job:

```bash
$ node horizon/tools/jobs/ctl.js status j_a3f1b2c4

╔════════════════════════════════════════════════════════════════╗
║ Job Status: j_a3f1b2c4                                         ║
╚════════════════════════════════════════════════════════════════╝

Status:     pending
Type:       subagent
Created:    2026-02-24T00:15:00Z
Elapsed:    45s
Timeout:    300s
Progress:   Phase 2/3: Building schema...
Priority:   normal
Session:    user:main:session123
```

#### `jobs cancel <jobId> [--force]`

Cancel a pending job:

```bash
$ node horizon/tools/jobs/ctl.js cancel j_a3f1b2c4

✅ Job cancelled: j_a3f1b2c4
```

Use `--force` for immediate kill (no graceful shutdown):

```bash
$ node horizon/tools/jobs/ctl.js cancel j_a3f1b2c4 --force

✅ Job forcefully cancelled: j_a3f1b2c4
```

---

## Metrics & Monitoring

### LLM Attribution Report

Run at end-of-day (EOD) or end-of-week (WND) to track LLM starvation signals:

```bash
# End-of-day report (last 1 day)
node horizon/tools/report/llm-attribution.js --days 1

# Week-end report (last 7 days)
node horizon/tools/report/llm-attribution.js --days 7

# Custom window
node horizon/tools/report/llm-attribution.js --from 2026-02-20 --to 2026-02-24
```

**Output includes:**
- Handling mix (Anthropic / Local LLM / Skill / Unknown)
- Provider/model distribution
- Fallback rate and reasons
- Subagent/session breakdown
- Execution duration buckets

**Key signals to watch:**
- **Anthropic starvation**: If Anthropic share drops below 60%, local LLM is compensating
- **High fallback rate**: >10% suggests degraded performance
- **Long durations**: >5s bucket growing indicates system load

### Store Reports in Dataset

EOD/WND reports are auto-stored in:
```
horizon/runtime/datasets/llm-interactions/
  eod-2026-02-24.json
  eod-2026-02-23.json
  wnd-2026-W08.json
```

This becomes your historical llama dataset for training and analysis.

---

## Checklist: Implementing These Standards

- [ ] Create `horizon/runtime/jobs/{pending,completed,failed}` directories
- [ ] Implement job lifecycle in `sessions_spawn`
- [ ] Add heartbeat emitter to gateway main loop (5–10s interval)
- [ ] Add watchdog timer (checks `lastHeartbeat`, triggers recovery if >10s stale)
- [ ] Deploy `horizon/tools/jobs/ctl.js` for job control
- [ ] Deploy `horizon/tools/report/llm-attribution.js` for metrics
- [ ] Schedule EOD/WND reports (cron or heartbeat)
- [ ] Log stack traces on watchdog trigger
- [ ] Implement job recovery scan on startup
- [ ] Train team on `jobs list|status|cancel` commands

---

## FAQs

**Q: What happens if a subagent is already running when the watchdog triggers?**
A: The job is marked failed, and the worker restarts. If the subagent made git commits, those persist; you can recover via `git log`. If the subagent was mid-operation in memory, that work is lost.

**Q: How long can a job run before the watchdog kills it?**
A: The watchdog checks every ~5s. If heartbeat is missing for >10s, it triggers. So a job can run indefinitely *as long as it emits heartbeats*. The timeout field in the job record is optional and can be used for application-level timeouts.

**Q: Can I increase the heartbeat interval?**
A: No — 10s is the hard rule. If you need longer-running jobs, structure them as periodic sub-tasks with heartbeat checkpoints.

**Q: What's the difference between `cancel` and `cancel --force`?**
A: Graceful cancel allows the job to finish its current operation and clean up. Force kill terminates immediately. Use graceful by default; force only when graceful isn't working.

**Q: Where do I trigger EOD/WND reports?**
A: Via cron job or heartbeat polling. Add to `HEARTBEAT.md` or schedule via gateway cron. Reports auto-store in `horizon/runtime/datasets/llm-interactions/`.

---

## Version History

- **v1.0** (2026-02-24): Initial standards — Rule A (non-blocking), Rule B (watchdog), Rule C (job control), metrics integration

