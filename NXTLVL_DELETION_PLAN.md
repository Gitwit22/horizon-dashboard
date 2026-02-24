# NXTLVL Folder Erasure Plan

**Prepared:** 2026-02-24 01:52 EST  
**Status:** ANALYSIS COMPLETE — AWAITING EXPLICIT APPROVAL ("Proceed")  
**Target:** Delete C:\NxtLvl\ entirely after consolidation to C:\Users\klaws\clawd\

---

## Executive Summary

The C:\NxtLvl\ folder contains:
- 1 real git repo (StreamLine) — must be moved
- Obsolete/stale code copies (MeJay, Horizon, Logic-Heart)
- Duplicate skills (git, vscode) — newer versions exist in clawd
- Unique skill (gmail-skill) — split into gmail-approvals + gmail-reader in clawd
- Empty folders (media, archive, clients, sandbox)

**Decision:** Move StreamLine, verify no losses, then delete entire C:\NxtLvl\ folder.

---

## Detailed Analysis

### Git Repos Found

#### ✅ StreamLine (REAL SOURCE)
**Location:** C:\NxtLvl\core\streamline  
**Latest commit:** `88231b63` (Merge PR #35, HLS dev)  
**Remote:** https://github.com/Gitwit22/streamline-platform  
**Size:** ~500MB (large node_modules)  
**Action:** MOVE → C:\Users\klaws\clawd\projects\streamline\  

**Pre-move verification:**
```bash
cd C:\NxtLvl\core\streamline
git log --oneline -1          # Confirm: 88231b63
git remote -v                 # Confirm: Gitwit22/streamline-platform
git status                    # Should be: working tree clean
```

**Move command (when approved):**
```powershell
Move-Item -Force "C:\NxtLvl\core\streamline" "C:\Users\klaws\clawd\projects\streamline"
cd C:\Users\klaws\clawd\projects\streamline
git log --oneline -1          # Verify history intact
git remote -v                 # Verify remote still present
```

---

#### ❌ Stale Copies (DELETE)

| Folder | Type | Status | Size |
|--------|------|--------|------|
| C:\NxtLvl\core\horizon | Not a git repo | Orphaned scaffold | Unknown |
| C:\NxtLvl\core\mejay | Not a git repo | Orphaned (real code in clawd\projects\mejay) | Unknown |
| C:\NxtLvl\core\logic-heart | Not a git repo | Orphaned | Unknown |
| C:\NxtLvl\horizon | Not a git repo | Orphaned (real code in clawd\horizon) | Unknown |

**Action:** DELETE (they are not git repos, no loss of history)

---

### Skills Analysis

#### Exact Duplicates (DELETE from NxtLvl)

**git skill:**
- **NxtLvl:** C:\NxtLvl\skills\git (5.3 KB, 2026-02-20 9:45 PM)
- **clawd:** C:\Users\klaws\clawd\horizon\skills\git (9.7 KB, 2026-02-21 6:47 AM)
- **Status:** clawd version is NEWER + LARGER
- **Action:** DELETE from NxtLvl (clawd is canonical)

**vscode skill:**
- **NxtLvl:** C:\NxtLvl\skills\vscode (2026-02-19 7:31 AM)
- **clawd:** C:\Users\klaws\clawd\horizon\skills\vscode (2026-02-21 6:48 AM)
- **Status:** clawd version is NEWER
- **Action:** DELETE from NxtLvl (clawd is canonical)

#### Unique/Refactored (REVIEW)

**gmail-skill:**
- **NxtLvl:** C:\NxtLvl\skills\gmail-skill (monolithic, ~npm deps)
  - Files: get-chat-id.js, gmail.js, request-approval.js, send-approved.js, telegram-send-only.js
- **clawd:** Split across:
  - C:\Users\klaws\clawd\horizon\skills\gmail-approvals (newer architecture)
  - C:\Users\klaws\clawd\horizon\skills\gmail-reader (newer architecture)
- **Status:** clawd version is REFACTORED (modular)
- **Action:** DELETE from NxtLvl (clawd is newer/better)

---

### Empty/Orphaned Folders

| Path | Content | Size | Action |
|------|---------|------|--------|
| C:\NxtLvl\media\john-blaze | Empty | 0 | DELETE |
| C:\NxtLvl\archive | Empty | 0 | DELETE |
| C:\NxtLvl\sandbox | Empty | 0 | DELETE |
| C:\NxtLvl\clients\aapestpros | Empty | 0 | DELETE |

---

## Consolidation Checklist

**Before deletion, confirm:**

- [ ] StreamLine moved successfully to clawd\projects\streamline\
  - [ ] `git log -1` shows 88231b63 (history intact)
  - [ ] `git remote -v` shows Gitwit22/streamline-platform (remote intact)
  - [ ] No uncommitted changes in new location

- [ ] No references to NxtLvl\ paths in any code/docs
  ```powershell
  cd C:\Users\klaws\clawd
  Select-String -Path @("*.md","*.js","*.json") -Pattern "NxtLvl|C:\\NxtLvl" -Recurse
  ```

- [ ] Backup created (optional but recommended)
  ```powershell
  Compress-Archive -Path C:\NxtLvl -DestinationPath C:\NxtLvl_BACKUP_2026-02-24.zip
  ```

---

## Deletion Steps (When Approved)

**Step 1: Verify no references**
```powershell
cd C:\Users\klaws\clawd
Select-String -Path @("*.md","*.js","*.json","horizon/**/*.js") -Pattern "NxtLvl" -Recurse -ErrorAction SilentlyContinue
```

**Step 2: Create backup (optional)**
```powershell
Compress-Archive -Path C:\NxtLvl -DestinationPath C:\NxtLvl_BACKUP_2026-02-24.zip -Force
```

**Step 3: Delete entire folder**
```powershell
Remove-Item -Recurse -Force C:\NxtLvl
```

**Step 4: Verify deletion**
```powershell
Test-Path C:\NxtLvl  # Should return False
```

---

## Post-Deletion Verification

```powershell
# Confirm StreamLine is in new location
cd C:\Users\klaws\clawd\projects\streamline
git log --oneline -1
git remote -v
git status

# Confirm no Horizon items outside clawd
Get-ChildItem C:\Users\klaws -Directory -Filter "*horizon*" -ErrorAction SilentlyContinue
Get-ChildItem C:\Users\klaws -Directory -Filter "*nxtlvl*" -ErrorAction SilentlyContinue  # Should be empty
```

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| StreamLine git history lost | 🟢 Very Low | Verify before deletion; backup available |
| Unique code lost | 🟢 Very Low | All unique code already in clawd (skills mirrored/refactored) |
| Broken file paths | 🟡 Low | Search for NxtLvl references first |
| Accidental deletion of wrong folder | 🟢 Very Low | Will use explicit paths, not wildcards |

---

## Rollback Plan

If something goes wrong after deletion:

1. **Restore from backup:**
   ```powershell
   Expand-Archive -Path C:\NxtLvl_BACKUP_2026-02-24.zip -DestinationPath C:\ -Force
   ```

2. **Restore StreamLine from git:**
   ```powershell
   cd C:\Users\klaws\clawd\projects\streamline
   git reset --hard origin/main  # Restore from remote
   ```

3. **Report issue immediately to Horizon**

---

## Status

✅ **Analysis Complete**  
⏳ **Awaiting Approval**  
❌ **No deletions executed yet**

**Next:** User says "Proceed" → Execute deletion steps above

---

**Prepared by:** Horizon  
**Date:** 2026-02-24 01:52 EST
