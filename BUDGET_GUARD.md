# Budget Guard System

**Purpose:** Prevent paid-model budget leak during slow FS operations and verbose narration.

---

## Root Cause Analysis (2026-02-23 18:04)

**Surface Symptom:** "Get-ChildItem stalled, then budget ran out"

**Actual Mechanism:** 
1. `Get-ChildItem -Recurse` took 20+ seconds (slow FS op)
2. **During that wait**, Haiku session stayed alive + context kept streaming
3. Verbose narration ("Let me check the structure…", "Now reading files…") fed more tokens into the open session
4. Long-running operation + high-context chatter = budget leak
5. Result: Expensive model wasted on I/O wait, not reasoning

**Key Insight:** The problem wasn't spending tokens—it was keeping the **paid model awake** during unpaid work (filesystem ops).

---

## Prevention Rules

### ⚠️ Before Expensive Operations

**Check token budget:**
```javascript
if (currentTokens > budgetThreshold) {
  console.warn(`🚨 Token budget low (${currentTokens}/${budgetMax}). Switching to Llama.`);
  await session_status({ model: 'ollama/llama3.1:8b' });
  return;
}
```

**Limit exec scope:**
- ✅ `dir C:\path\-filter "*.ts" | select -first 50`
- ❌ `Get-ChildItem -Recurse C:\` (unbounded)

**Set timeouts:**
- `exec(..., timeout: 30000)` — kill after 30s
- Spawn background jobs instead: `exec(..., background: true)`

---

## Cost Tier Strategy

**Don't use token thresholds alone. Route by operation type.**

| Operation | Tier | Model | Rule |
|-----------|------|-------|------|
| FS scan (find, grep, recurse) | **Local Only** | Llama | Always. No exceptions. |
| npm audit, install, setup | **Local + Paid Summary** | Llama → Haiku | Llama runs command; Haiku reads results |
| Code parsing, analysis | **Local First** | Llama → Haiku | Llama does parse; Haiku does reasoning if needed |
| Chat, reasoning, planning | **Paid** | Haiku | Direct to paid model (no FS overhead) |
| Complex/uncertain responses | **Local Fallback** | Llama | Route to Llama; dataset trains it on patterns |

**Token Thresholds (Safety Nets):**
- > 160k tokens: Warn user ("🚨 Token budget 80% — suggest caching/cooldown")
- > 180k tokens: Switch to Llama for next task
- > 190k tokens: Refuse non-critical tasks until reset

**Current setup:**
- Primary: Haiku ($0.80 / $2.40 per 1M) — for reasoning + routing decisions
- Fallback: Llama (free) — escalations, uncertainty, FS ops
- Removed: DeepSeek (never surface to user)

---

## Rules for This Session

### Rule 1: No Narration While Waiting
**When a command is running:**
- Output: One line max: `"Running: <command> (timeout 30s)…"`
- Then: **Silence** until result/timeout
- Never: "76%… still installing…" or progress updates
- Why: Verbose narration keeps paid session alive during unpaid I/O wait

**Example:**
```
❌ Wrong:
"Let me check the directory structure…"
[command runs]
"Now reading files…"
[command runs]
"Analyzing results…"

✅ Right:
Running: Get-ChildItem (timeout 30s)…
[command runs]
[silent]
[result delivered]
```

### Rule 2: FS/OS-Heavy Ops Use Local Model
**Before executing slow filesystem operations:**
- Detect: `Get-ChildItem -Recurse`, `find`, `grep`, `npm install`, etc.
- Route: Use **Llama** (free, local) for crawling/searching
- Paid model (Haiku) only used to **summarize final results**
- Benefit: Local model handles I/O; paid model handles reasoning

**Pattern:**
```
1. [Local/Llama] Scan filesystem: "Get top-level dirs + file count"
2. [Local/Llama] Create artifact: repo-map.json
3. [Haiku] Read artifact: "Summarize what you found"
```

### Rule 3: Deterministic Scoping (No Unbounded Recursion)
**Windows PowerShell 5.1 doesn't have `-Depth`; use explicit scoping:**

✅ **Preferred:** `Get-ChildItem -Directory C:\path\src, C:\path\packages, C:\path\apps`
- Allowlist specific dirs only (src, packages, apps, horizon, skills, etc.)
- No recursion

✅ **Alternative:** `Get-ChildItem -Filter "*.ts" -Include "*.tsx" | Select-Object -First 50`
- Use `-Filter` early (`.ts`, `.tsx`, `package.json`)
- Cap results (max 50-100 per query)

❌ **Never:** `Get-ChildItem -Recurse` on unbounded paths

### Rule 4: Artifact-First Outputs
**Every exploration step must emit a deliverable file (not just chat):**

```
repo-map.json
├─ directories (top-level + file counts)
├─ entry points (package.json, tsconfig.json)
└─ risk flags (README, deprecated files)

deps-summary.json
├─ dependencies (package.json)
├─ security (audit results)
└─ upgrade candidates

risk-notes.md
├─ "What's dangerous?"
├─ "What's expensive?"
└─ "Recommendations"
```

**Why:** 
- Prevents "chatty progress" (no "let me check" narration)
- Forces real deliverables, not just words
- Paid model reads artifacts, doesn't generate them

### For File Operations (Updated)
- **Scoping:** Allowlist specific directories only (src, packages, apps, horizon, skills)
- **Capping:** Stop after N results (cap at 50-100 per query)
- **Filtering:** Use `-Filter` / `-Include` to narrow early
- **Timeout:** Always set > 30 seconds, with "Running…" message then silence

### For Code Analysis
1. Load files in chunks (≤5 at a time)
2. Don't read entire projects in one go
3. Parse locally (Llama), summarize with Haiku if needed
4. Emit risk-notes.md artifact instead of verbose narration

### For Expensive Audits
1. Spawn sub-agent (isolated token budget) OR use Llama for scanning
2. No paid model while waiting on filesystem
3. Report incrementally via artifacts (audit-findings.json, etc.)
4. Don't hold results until end

### For npm Audits (MeJay-Specific)
**Read-only first:** `npm audit` (no changes)  
**Conservative fix:** `npm audit fix` (no --force, patch/minor only)

**Surgical approach:**
1. Identify vulnerable package in output
2. Upgrade the top-level dependency you control (not transitive)
3. Re-run tests / smoke run
4. Repeat for next vuln

**Policy:** Fix only if:
- Reachable in production runtime + non-breaking upgrade exists, OR
- Critical/High + known exploit relevant to your app
- Otherwise: defer to scheduled dependency maintenance

---

## Token Burn Estimates

| Task | Tokens | Cost (Haiku) |
|------|--------|-------------|
| Read audioEngine.ts | 8,000 | $0.006 |
| Read bpmDetector.ts | 2,000 | $0.0015 |
| Read db.ts (full) | 5,000 | $0.004 |
| Analyze & report | 12,000 | $0.01 |
| **Total (audit)** | **27,000** | **$0.021** |

**Current session:** 52k tokens = ~$0.042 cost so far

---

## Fallback Strategy

When Anthropic budget exhausts:
1. **Automatic:** Switch to Llama for next request
2. **Notify user:** "🔋 Switched to free Llama model for this task"
3. **Continue:** No interruption, just slower inference
4. **Restore:** Revert to Haiku when budget resets (daily)

---

## Implementation

Add to HEARTBEAT.md:
```markdown
## Budget Check (every 30 min)
- [ ] Run `session_status`
- [ ] If tokens > 160k, send warning
- [ ] If tokens > 180k, switch to Llama
```

Add guard to critical tasks:
```bash
# Before expensive file scans
TOKENS=$(clawdbot status | grep -oP 'Tokens: \K[0-9]+')
if [ $TOKENS -gt 160000 ]; then
  echo "🔋 Switching to Llama (budget: ${TOKENS}/200k)"
  /reason/fallback-to-llama
  exit 0
fi
```

---

## Lessons

❌ **Don't:** Spawn unbounded recursive filesystem operations  
✅ **Do:** Scope queries, set timeouts, check budget first  

❌ **Don't:** Hold results until end of audit  
✅ **Do:** Report incrementally as you discover issues  

❌ **Don't:** Assume 200k tokens is infinite  
✅ **Do:** Budget for 150k max per session, use free fallback beyond

---

**Written:** 2026-02-23 18:07 EST  
**Owner:** Horizon
