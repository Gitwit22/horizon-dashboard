# PATCH_RECEIPT.md — Audit Log of All Changes

**Purpose:** Every file creation/update is logged here with proof. If the gateway wedges mid-operation, you can verify what actually landed.

**Format:** Each entry is a receipt for a batch of changes. Must include:
- What changed (paths, why)
- Commands run
- Rollback procedure
- Proof (git commit + verification commands)

---

## 2026-02-24T00:20 — Horizon Standards & Job Control Framework

**whatChanged:**
```json
[
  {"path": "C:\\Users\\klaws\\clawd\\horizon\\tools\\report\\llm-attribution.js", "change": "created", "why": "LLM telemetry aggregator with Anthropic starvation detection"},
  {"path": "C:\\Users\\klaws\\clawd\\horizon\\tools\\report\\eod-report.sh", "change": "created", "why": "EOD metrics report script"},
  {"path": "C:\\Users\\klaws\\clawd\\horizon\\tools\\report\\wnd-report.sh", "change": "created", "why": "Week-end metrics report script"},
  {"path": "C:\\Users\\klaws\\clawd\\horizon\\runtime\\jobs\\SCHEMA.md", "change": "created", "why": "Job control system specification (Rule A/B/C)"},
  {"path": "C:\\Users\\klaws\\clawd\\horizon\\tools\\jobs\\ctl.js", "change": "created", "why": "Job control CLI (list/status/cancel)"},
  {"path": "C:\\Users\\klaws\\clawd\\STANDARDS.md", "change": "created", "why": "Horizon operational standards (non-blocking, watchdog, job control)"},
  {"path": "C:\\Users\\klaws\\clawd\\AGENTS.md", "change": "updated", "why": "Integrated Rule A/B/C into agent standards"},
  {"path": "C:\\Users\\klaws\\clawd\\QUICK_REFERENCE.md", "change": "created", "why": "Operations cheat sheet"}
]
```

**commandsRun:**
- `write C:\Users\klaws\clawd\horizon\tools\report\llm-attribution.js`
- `write C:\Users\klaws\clawd\horizon\tools\report\eod-report.sh`
- `write C:\Users\klaws\clawd\horizon\tools\report\wnd-report.sh`
- `write C:\Users\klaws\clawd\horizon\runtime\jobs\SCHEMA.md`
- `write C:\Users\klaws\clawd\horizon\tools\jobs\ctl.js`
- `write C:\Users\klaws\clawd\STANDARDS.md`
- `edit C:\Users\klaws\clawd\AGENTS.md` (added Rule A/B/C section)
- `write C:\Users\klaws\clawd\QUICK_REFERENCE.md`

**where:**
`C:\Users\klaws\clawd`

**rollback:**
```bash
git revert <commit-hash>
# or selective:
git checkout HEAD^ -- horizon/tools/report/llm-attribution.js
git checkout HEAD^ -- horizon/tools/jobs/ctl.js
# etc.
```

**proof:**
- Commit hashes: 
  - `6514f66` — Standards docs (AGENTS.md, STANDARDS.md, QUICK_REFERENCE.md, PATCH_RECEIPT.md)
  - `9e55098` — Horizon tools (llm-attribution.js, job control CLI, job schema)
- Verify with:
  ```bash
  git show --stat 6514f66
  git show --stat 9e55098
  git diff 6514f66^..9e55098 -- horizon/tools/
  ```

---

## How This Works

### When Horizon Creates/Updates Files

**Before** → Write the file  
**During** → Log to PATCH_RECEIPT.md  
**After** → Git commit + output receipt

### Receipt Format (Machine)
```json
{
  "timestamp": "2026-02-24T00:20:00Z",
  "whatChanged": [
    {"path": "C:\\Users\\klaws\\clawd\\FILE.js", "change": "created|updated", "why": "..."}
  ],
  "commandsRun": ["write ...", "edit ..."],
  "where": "C:\\Users\\klaws\\clawd",
  "rollback": ["git revert <hash>"],
  "proof": {
    "commitHash": "abc1234",
    "verifyWith": ["git show --name-only abc1234", "git diff abc1234^ abc1234"]
  }
}
```

### Proof Snippet (Human)
```
Commit: abc1234
Files:
  C:\Users\klaws\clawd\horizon\tools\report\llm-attribution.js (created, 11.3 KB)
  C:\Users\klaws\clawd\STANDARDS.md (created, 9.6 KB)
  C:\Users\klaws\clawd\AGENTS.md (updated, +120 lines)

Verify: git show --stat abc1234
```

### When Horizon Wedges

If the gateway freezes after "✅ created":
1. Run: `git log --oneline -3`
2. Check: `git show --name-only <latest-commit>`
3. Verify files exist: `ls -la C:\Users\klaws\clawd\horizon\tools\report\llm-attribution.js`
4. If partial: `git revert <hash>` and retry
5. If clean: `git push` and continue

---

## Rules for Receipts

1. **Every batch of file changes = one receipt entry**
2. **Include absolute paths only** — no URLs, no relative paths
3. **Include "why"** — reason for the change
4. **Include git rollback** — how to undo it
5. **Include proof commands** — how to verify it landed

---

## Template (Copy & Paste)

```markdown
## YYYY-MM-DDTHH:MM — Description

**whatChanged:**
```json
[
  {"path": "C:\\Users\\klaws\\clawd\\FILE.js", "change": "created|updated", "why": "..."}
]
```

**commandsRun:**
- `write C:\Users\klaws\clawd\FILE.js`

**where:**
`C:\Users\klaws\clawd`

**rollback:**
```bash
git revert <hash>
```

**proof:**
- Commit hash: `<pending>`
- Verify with: `git show --name-only <hash>`
```

