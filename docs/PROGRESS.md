# ClashHQ — PROGRESS.md

> This file is the authoritative session handoff. Every session starts by reading this file,
> `CLAUDE.md`, and `docs/phases/phase-N.md`. Every session ends by updating this file.
> Never claim a phase is complete based on chat history — update only from verified local state.

---

## Project Overview

- **Specification:** `CLASHHQ_SPEC.md` (v10, frozen baseline)
- **Agent rules:** `AGENTS.md` (workspace-enforced) + `CLAUDE.md` (standing rules)
- **GitHub remote:** https://github.com/Harsha-Kyle/ClashHQ (not yet configured as a Git remote in this workspace)
- **Current phase:** Phase 0 — API verification and sanitized fixtures
- **Phase 0 status:** in progress (agent tooling created; awaiting human capture run and approval)

---

## Phase Status

| Phase | Status | Notes |
|---|---|---|
| Phase 0: API verification | in progress | Agent tooling complete; awaiting human capture and approval |
| Phase 1: Foundation | not started | Blocked on Phase 0 gate |
| Phase 2: Clan and membership history | not started | |
| Phase 3: Wars and rules | not started | |
| Phase 4: CWL planner | not started | |
| Phase 5: Raid tracking | not started | |
| Phase 6: Profiles and analytics | not started | |
| Phase 7: Export, backup and restore | not started | |
| Phase 8: Release readiness | not started | |

---

## Session: 2026-10-20 (Phase 0 initial implementation)

### Task
Phase 0 initial implementation: standing documentation, capability registry, sanitizer, and tests.

### Local Checkpoint
No checkpoint was made before this session because it is the first session and no schema or
migration changes were involved (Phase 0 creates no database tables). The workspace was verified
clean (3 spec files + 1 empty text file) before any files were created.

### Files Created This Session

```
CLAUDE.md                              — Standing rules (spec §§0,1,2,4,4.1-4.5,5.10,9,11,12,13,15)
docs/phases/phase-0.md                 — Phase 0 acceptance criteria, division of labour, gate checklist
docs/PROGRESS.md                       — This file
docs/DECISIONS.md                      — Architectural decisions log
docs/api-notes.md                      — Narrative capability documentation (all: unverified)
.nvmrc                                 — Node 24 LTS pin
.gitignore                             — Protects data/, key files, raw captures, .env
package.json                           — Root package; Phase 0 tooling only (ts-node, vitest, zod, typescript)
tsconfig.json                          — TypeScript configuration
shared/capabilities.json               — Canonical machine-readable capability registry (all: unverified)
shared/capabilitySchema.ts             — Zod schema for the registry
scripts/capture-fixtures.ts            — Capture script (human runs; enforces external raw-output path)
scripts/sanitizer.ts                   — Deterministic relational-preserving sanitizer
tests/sanitizer.test.ts                — Sanitizer tests using synthetic data only
tests/registry-consistency.test.ts     — Registry / api-notes.md consistency test
tests/capture-cli.test.ts              — Capture CLI option parser and argument validation tests
docs/schema.md                         — Baseline schema and record classification (A-E, T) per spec §§4.5, 5.2, 6, 10
```

### Commands Actually Run and Results

<!-- To be filled after npm install and vitest run -->

| Command | Result |
|---|---|
| `winget install --id OpenJS.NodeJS.LTS --version 24.20.0` | Succeeded (installed Node.js 24 LTS) |
| `npm run build:scripts` (`tsc -p tsconfig.json`) | Succeeded (exit code 0) |
| `npm run typecheck` (`tsc --noEmit`) | Succeeded (exit code 0, 0 type errors) |
| `npm test` (`vitest run`) | Succeeded (74 passed across 3 test files, exit code 0) |

### Gates Applicable This Session

| Gate | Status | Reason if not applicable |
|---|---|---|
| Node.js 24 LTS runtime requirement | PASSED | Verified `node -v` returns `v24.20.0`, npm `11.19.0` |
| `shared/capabilities.json` Zod validation | PASSED | Verified in `tests/registry-consistency.test.ts` |
| Registry / api-notes.md consistency | PASSED | Verified in `tests/registry-consistency.test.ts` (11 tests passed) |
| Sanitizer tests pass | PASSED | Verified in `tests/sanitizer.test.ts` (46 tests passed) |
| Typecheck | PASSED | Verified via `tsc --noEmit` under Node 24 (0 errors) |
| Lint | not yet applicable | ESLint not yet configured (Phase 1) |
| Build | not yet applicable | No application code exists (Phase 1) |
| Human fixture review | PENDING | Awaiting human capture run |
| Human registry approval | PENDING | Awaiting human capture run |

### Known Bugs, Blockers, Open Questions

- **Capability progress:** 7 capabilities promoted to `field_observed` based on real capture evidence: `clan-info`, `clan-members`, `current-war`, `war-attack-order`, `war-log`, `raid-seasons`, `raid-attack-limit-fields`.
- **Remaining unverified capabilities (9):**
  - `cwl-league-group`, `cwl-war`: Blocked on active CWL tournament season (off-season returns HTTP 404).
  - `raid-attack-order`: Unverified; capital raid attacks do not expose a global order across districts.
  - `player-profile`, `hero-equipment`, `super-troops`, `war-preference`, `clan-games-achievement`, `player-tag-lookup`: Pending `--player-tag` capture run.
- **Blocker (human):** Human review of sanitized fixtures and formal Phase 0 gate approval.
- **Open decision:** Git remote URL must be confirmed before the first phase checkpoint commit
  (spec §0.1: "If no remote is configured, stop and confirm the correct URL before adding one").
  `PROJECT_STATE.md` records https://github.com/Harsha-Kyle/ClashHQ — this has not been verified
  as reachable or configured in the local workspace.

### Next Three Concrete Steps

**Step 1 (Human):** (Optional for Phase 0 closeout / unblocking player capabilities) Run capture with `--player-tag`:
```bash
npm run capture -- --raw-output "C:\Users\<you>\clashhq-raw-captures" --fixtures-output "./fixtures" --clan-tag "#YOURCLAN" --player-tag "#YOURPLAYER"
```

**Step 2 (Human):** Inspect the generated sanitized files in `./fixtures/` to verify no real clan tags, player tags, names, IP addresses, or tokens leaked.

**Step 3 (Human):** Grant human Phase 0 fixture review and registry approval in `docs/PROGRESS.md` to authorize Phase 1.

### Safe State
The project folder is in a safe, buildable state for Phase 0 tooling.
No application code, database, migrations, or credentials exist.

---

## Human Approvals

_None yet. Required before Phase 0 gate passes._

| Date | Approver | Scope | Evidence |
|---|---|---|---|
| — | — | Phase 0 fixture review | — |
| — | — | Capability registry approval | — |
| — | — | Phase 0 gate (authorises Phase 1) | — |

---

## Checkpoint Log

| Checkpoint | Path | Triggering Task |
|---|---|---|
| — | No checkpoints yet | First session; no schema/migration changes |

---

## Phase Completion Records

_No phase is complete yet._
