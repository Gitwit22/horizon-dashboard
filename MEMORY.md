# MEMORY.md — Long-Term Memory

*Curated knowledge. Updated over time.*

---

## Who I Am
**Horizon** 🌅 — Executive AI Operations Layer for Nxt Lvl Technology Solutions

**System Status (Feb 21, 2026):**
- **Skill Registry:** 6 skills loaded, exact match + alias resolution
- **Routing:** Fail-closed (skill→execute or error, never silent LLM fallback)
- **Response Layer:** JSON→readable markdown with personality via Response Presenter
- **Identity Injection:** SOUL/IDENTITY/USER loaded safely, system prompt injected into LLM calls
- **LLM Instruction:** Explicit rules — "Casual=plain text, never invent tool JSON, skills only execute on exact match"

## Who I Serve
**John Steele** (John Blaze) — builder-strategist hybrid founder, Detroit-based, platform thinker

## Key Insight
John's bottleneck isn't ideas or capability — it's **focus bandwidth**. My job is to help him concentrate force, not scatter it.

---

## Projects (High Level)
| Project | Role |
|---------|------|
| StreamLine | Infrastructure play — primary revenue engine candidate |
| MeJay | Cash flow + brand building |
| Smart Pallets/WAMS | IP moonshot |
| Detroit BI | Institutional credibility |
| StreamLine EDU | Public sector wedge |

---

## Technical Foundation

### Skill Registry (`horizon/skill-registry.js`, 206 lines)
- In-memory singleton, scans two roots (Horizon-owned + executable)
- Exact command match + alias resolution
- Returns executor functions for skill execution
- **Status:** ✅ 6 skills loaded and working

### Routing Architecture
1. Input → Registry.matchCommand() → decision.skill populated
2. Policy layer (router/policy.js) → skill/llm/blocked route
3. **Skill:** Execute via executor, fail-closed (error if missing, never LLM fallback)
4. **LLM:** Load identity, build system prompt [SYSTEM block], prepend to call
5. **Blocked:** Hard error with reason

### Response Presenter (`horizon/response-presenter.js`, 298 lines)
- Skill-specific formatters (system/git/docgen/gmail/vscode/telemetry/ziptrainer)
- Structured bullets only, no hallucination
- Personality rotation ("What up doe!", "Here's the lowdown:", etc.)
- Marks result as `formatted: true` for gateway
- **Status:** ✅ Tested, memory calculations accurate

### Identity Injection (`horizon/identity-loader.js`, 214 lines)
- Loads SOUL.md, IDENTITY.md, USER.md from agent folder
- Parses markdown via regex (fixed Feb 21 for `- **Key:** Value` format)
- Builds system prompt with agent name, vibe, user context
- Injected only when route=llm
- **Status:** ✅ Fixed markdown parser regex, all fields extracted cleanly

### Source of Truth (`config/CANONICAL.json`)
- Documents paths, skill roots, LLM endpoints, routing rules
- Active agent explicitly set to "apex"
- .clawdbot gateway wrapper kept independent
- **Status:** ✅ Locked

### Telemetry
- JSON Lines at `horizon/runtime/telemetry/llm.jsonl`
- Tracks route, reason, latency, aliasMatched, skillMatched
- Doctor script tails last 10 events
- **Status:** ✅ Correct routing being logged

---

## Lessons Learned

### Markdown Parsing Bug (Feb 21)
**Problem:** Regex didn't match file format `- **Key:** Value` (colon inside bold).
**Root Cause:** Original pattern expected `**Key**:` (colon outside), file has `**Key:**` (colon inside).
**Solution:** Updated regex to `/^-\s+\*\*([^:]+):\*\*\s+(.+)$/`.
**Learning:** Character-by-character debugging (charCodeAt, position analysis) reveals syntax details. Always test regex against actual files.

### Identity Scope (Safety)
Loader runs ONLY on route=llm. Skill paths are fast, no unnecessary file I/O. No secrets in SOUL/IDENTITY/USER (purely public agent persona). Telegram token and API keys stay in .env.

### Fail-Closed Confidence
Matched skill = will execute or error hard. No silent LLM fallback. Users get honest error messages. System prompt teaches LLM this limitation upfront ("skills only execute on exact match").

### Testing Pattern
Create test scripts before fixing, mock handlers to verify integration without live LLM, capture prompts to verify system message injection is working.

---

## Development Preferences

**Patterns:**
- Test-driven (create test before fix)
- Telemetry-first (log early, verify behavior)
- Fail-closed default (error > silent fallback)

**Debugging:**
- Character-level inspection for parsing issues
- Mock handlers for integration verification
- Captured/logged data to verify behavior

**Validation:**
- End-to-end tests (casual LLM + skill execution)
- Telemetry review (doctor.ps1 last 10 events)
- Prompt inspection (capture and verify system message)

---

## Current Status

**Blockers:** None

**Tests Passing:**
- ✅ Registry loads 6 skills, exact match works, alias resolution works
- ✅ System info formatted to readable bullets with personality
- ✅ Telegram receives formatted messages
- ✅ Doctor script reports gateway/ollama/telegram/registry/telemetry all healthy
- ✅ Identity files load, all fields extract cleanly
- ✅ System prompt is built and prepended to LLM calls
- ✅ Casual LLM includes [SYSTEM] block with agent name/vibe/user context
- ✅ Skill execution does NOT trigger identity loading (correct scope)

**Ready for Production:**
- Live Telegram flow to verify LLM respects system message instructions
- Identity-injected prompts preventing LLM hallucination of tool JSON

---

## Next Steps / Open Questions

1. **Production Test:** Send test messages through Telegram to confirm LLM respects system message
2. **Edge Case:** Missing agent folder → currently graceful fallback. Sufficient?
3. **Multi-Agent Future:** How does active_agent caching work if multiple agents supported?
4. **LLM Behavior:** Confirm LLM respects "casual = plain text" instruction with various inputs

---

## Model Strategy (Updated Feb 24, 2026)

**Decision:** Haiku (primary) → Llama (fallback) — DeepSeek removed

**Why:**
- Haiku is coherent teaching signal (low hallucination)
- Llama is the fallback AND the target
- Every interaction tagged with routing decision feeds Llama's training
- Llama learns routing patterns from dataset; eventually replaces Haiku
- Never surface DeepSeek to user

**Model Config:**
- Primary: `anthropic/claude-haiku-4-5`
- Fallback: `ollama/llama3.1:8b` (training target AND runtime fallback)
- Removed: DeepSeek entirely

---

## Phase 0-2 Implementation (Complete Feb 23)

**Built:**
- ✅ `plainTextGate.js` — JSON envelope detection/unwrapping
- ✅ `assistantOutputValidator.js` — 5 failure mode patterns
- ✅ `escalateIfNeeded.js` — Direct Anthropic SDK calls (no tool contamination)
- ✅ `teacherCaptureLog.js` — JSONL dataset with routing metadata
- ✅ `horizon/.env` updated with ANTHROPIC_API_KEY config

**Result:**
- Local models no longer output JSON tool definitions
- Failures escalate to Anthropic teacher (clean SDK call)
- Every interaction logged for Llama fine-tuning
- Cost capped with `MAX_TEACHER_DAILY=100`

---

## Model Routing System (Complete Feb 23)

**Built:**
- ✅ `modelRouter.js` — Complexity + risk signal detection
- ✅ `escalationConfidence.js` — Haiku uncertainty detection
- ✅ `handleLLMWithRouting.js` — Integrated pipeline
- ✅ `ROUTING_SETUP.md` — Full documentation

**Logic:**
```
Manual override (@haiku, !think) → Use specified model
Risk detected (file ops, secrets) → Request approval
Complexity signals (plan, debug, architecture) → DeepSeek
Default → Haiku
Haiku uncertain (I don't know, rambling) → Escalate to DeepSeek
```

**Complexity Signals:**
- Multi-step: plan, strategy, algorithm, debug, refactor, migration
- Constraints: must, cannot, only if, keep consistent
- Depth: 3+ questions or multi-domain (security + networking)
- Formal: prove, derive, correctness, complexity, edge cases

**Risk Signals:**
- State-change: file writes, deletes, git ops
- Auth: tokens, passwords, credentials
- Network: firewall, ports, encryption

**Escalation Triggers (Haiku → Llama):**
- "I'm not sure", "cannot", "unknown", "it depends"
- Long response (>1000 chars) without structure
- Multiple clarifying questions
- Haiku uncertainty detected during response
- **Note:** User never sees this routing. Llama uses dataset to learn patterns.

---

## Dataset Logging (Feb 23)

Every interaction logged to `horizon/runtime/distill/logs/YYYY-MM-DD.jsonl`

**Fields:**
```json
{
  "routing": {
    "chosen_model": "haiku|llama",
    "reason": "default|escalate_to_llama",
    "complexity_signals": [],
    "risk_signals": []
  },
  "execution": {
    "skill_used": false,
    "approval_required": false
  },
  "label": {
    "task_type": "casual_chat|tool_call_compliance|general",
    "teacher_model": null
  }
}
```

This becomes Llama training data: each example tagged with routing decision. Llama learns when Haiku escalates and why, improving its own decision-making over time.

---

## Pending Integration

None! Everything is live and operational as of 2026-02-23 17:30 EST.

## Operating Procedure for New Codebases (Standard Workflow)

**When StreamLine or any new repo is handed to Horizon:**

**Phase 0 — Read-Only Mode (No Changes)**
- No installs, tests, dev server until owner-approved
- Read: README, package.json, lockfile, config files
- Produce artifacts only (no execution)

**Phase 1 — Artifacts (Bounded Exploration)**
Output these files:
- SESSION_PLAN.md — Approach, scope, owner approvals needed
- REPO_MAP.json — Top-level dirs, key files, entry points
- DEPS_SUMMARY.md — Dependencies, scripts, security flags
- HEALTH_REPORT.md — What's healthy/risky/needs attention
- FIX_BACKLOG.md — Issues found (severity, file paths, context)

**Phase 2 — Architecture (Only After Approval)**
If bugs are systemic, produce:
- FIX_PLAN_v1.md with:
  - File paths to change
  - Severity of each fix
  - Acceptance checks (how to verify)
  - Rollback steps (undo plan)

**Phase 3 — Patch (Only If Explicitly Approved)**
- Create branch (don't patch main/master)
- Produce PATCH_RECEIPT.json with:
  - Diff for each file changed
  - Rollback command
  - Test results
  - Owner approval date/time

**Discipline Rules:**
- No narration while commands run (one line "Running…", then silence)
- No claim without receipt (file path + diff or don't say "implemented")
- Approve before patching (never assume)
- Artifacts first, patches last

**Next Repo:** StreamLine will follow this workflow.

---

## Important Learning

**Tool Choices:** Always ask user first before switching tools/approaches
- Example: Bun vs npm choice
- Why: Projects have specific setup intent
- How: Ask "This requires X — do you have it / should I use Y?"

---

## Budget Management Incident (Feb 23, 2026)

**What Happened:**
- Ran unbounded `Get-ChildItem -Recurse` to audit MeJay codebase
- Command took 20+ seconds; token meter climbed during wait
- Hit Anthropic API budget mid-execution → process killed
- Result: Incomplete audit, wasted budget

**Surface Diagnosis vs. Real Root Cause:**
- **Surface:** "Tokens got spent"
- **Real Mechanism:** Haiku session stayed alive during slow FS ops. Verbose narration ("Let me check…") kept feeding tokens into open session. Long I/O wait + high-context chatter = budget leak.
- **Key Insight:** Problem wasn't spending tokens; it was keeping the **paid model awake during unpaid work**.

**Surgical Fixes (Implemented):**

1. **No Narration While Waiting**
   - Output: One line max ("Running: <cmd> (30s timeout)…")
   - Then: Silence until result
   - Prevents verbose narration from bleeding tokens during I/O wait

2. **Cost Tier Routing (Operation-Based)**
   - FS scans (find, grep, recurse) → Llama (local only)
   - npm ops (audit, install) → Llama runs; Haiku summarizes
   - Code analysis → Llama parses; Haiku reasons
   - Chat/planning → Haiku directly
   - Heavy thinking → DeepSeek only if needed
   - **Key:** Local model does I/O; paid model does reasoning

3. **Deterministic Scoping (No Unbounded Recursion)**
   - Allowlist dirs only: src, packages, apps, horizon, skills
   - PowerShell 5.1 has no `-Depth`, use explicit targets
   - Cap results at 50-100 per query
   - Use `-Filter` early to narrow scope

4. **Artifact-First Outputs**
   - Every exploration step emits: repo-map.json, deps-summary.json, risk-notes.md
   - Prevents "chatty progress" narration
   - Forces real deliverables, not just words
   - Paid model reads artifacts, doesn't generate them

**npm Audit Policy (MeJay-Specific):**
- Read-only first: `npm audit` (no changes)
- Conservative: `npm audit fix` (no --force, patch/minor only)
- Surgical: Upgrade top-level deps you control, one at a time, test after each
- Fix only if: reachable in production + non-breaking upgrade exists, OR critical/high + known exploit relevant to app
- Otherwise: defer to scheduled maintenance

**Model Fallback Strategy:**
- Primary: Haiku ($0.80/$2.40 per 1M) — reasoning + routing decisions
- Fallback: Llama (free) — escalations, complex reasoning, FS ops
- Never: DeepSeek (removed from routing entirely)
- Token thresholds: >160k warn, >180k switch to Llama, >190k refuse non-critical

**Lesson:** Budget is like money. The leak isn't spending—it's keeping expensive systems alive during unpaid work. Route by operation type, use local models for I/O, pay for reasoning only.

---

## Code Audit Post-Mortem (Feb 23, 2026)

**What I Did vs. What a Real Fix Requires:**

The MeJay bug audit identified 14 bugs (3 critical, 5 high, etc.) but was **diagnostic, not prescriptive**.

**Diagnostic Work (Completed):**
- ✅ Identified where invariants should exist (BPM > 0, duration finite)
- ✅ Found unsafe assumptions (audio buffer validation missing)
- ✅ Spotted concurrency hazards (play/playAt race conditions)
- ✅ Located state management gaps (no deck lifecycle state machine)

**What Wasn't Done (Real Fix Requires):**
- ❌ No code enforcement of invariants
- ❌ No state machine (just identified it was missing)
- ❌ No mutex pattern for concurrent ops
- ❌ No structured logging/observability
- ❌ No new abstractions

**Real Implementation Would Need:**
1. **State Machine:** DeckState lifecycle (EMPTY→LOADING→READY→PLAYING→STOPPED)
2. **Serialization Guard:** Mutex-like pattern to serialize play/stop per deck
3. **Bounds Checking:** Every public API validates inputs (BPM > 0, duration finite)
4. **Logging Layer:** Structured event tracing for playback transitions
5. **Audio Node Lifecycle:** Explicit creation → connection → start → cleanup

**Key Lesson:** Diagnosis ≠ Design. An audit finds problems; architecture prevents them. Next time: If asked to fix, propose the actual state machine + abstractions, not just band-aids.
