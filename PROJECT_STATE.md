# ClashHQ — Project State

## Project
- GitHub: https://github.com/Harsha-Kyle/ClashHQ
- Master specification: `CLASHHQ_SPEC.md` (v10, frozen baseline)
- Persistent rules: `AGENTS.md` + `CLAUDE.md`
- Current phase: Phase 0 — API verification
- Project status: Agent Phase 0 tooling and tests verified; awaiting human capture and approval

## Phase Status
- [ ] Phase 0: API verification and sanitized fixtures (Tooling verified; capture pending)
- [ ] Phase 1: Foundation and vertical slice
- [ ] Phase 2: Clan and membership history
- [ ] Phase 3: Wars and rules
- [ ] Phase 4: CWL planner
- [ ] Phase 5: Raid tracking
- [ ] Phase 6: Profiles and analytics
- [ ] Phase 7: Export, backup and restore
- [ ] Phase 8: Release readiness

## Completed Work
Record only work that exists and has been verified.
- Standing protocol documentation created: `CLAUDE.md`, `docs/phases/phase-0.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`.
- Machine-readable canonical capability registry created and validated: `shared/capabilities.json` with Zod schema `shared/capabilitySchema.ts`.
- Human-facing narrative documentation: `docs/api-notes.md` with strict machine-checkable headers (`Capability: <id> | Status: <status>`).
- Sanitizer and capture tooling implemented: `scripts/sanitizer.ts`, `scripts/capture-fixtures.ts`.
- Automated test suites created and passing:
  - `tests/sanitizer.test.ts` (46 tests passing, including secret detection and edge cases)
  - `tests/registry-consistency.test.ts` (11 tests passing)
  - `tests/capture-cli.test.ts` (17 tests passing, covering CLI parser, TTY raw-mode token prompt, and endpoint tag redaction)
- TypeScript strict typecheck passing (`npm run typecheck` exits 0).
- Runtime environment verified: Node.js 24 LTS (`v24.20.0`), npm `11.19.0`.

## Current Task
- Audit of Phase 0 capture output (5 sanitized fixtures + manifest).
- Awaiting resolution of manifest endpoint leak and remaining unverified endpoints (CWL active season, player-tag).

## Verification
- Tests run under Node.js 24 LTS (v24.20.0):
  - `npm run build:scripts` (`tsc -p tsconfig.json`) -> exit code 0
  - `npm run typecheck` (`tsc --noEmit`) -> exit code 0
  - `npm test` (`vitest run`) -> 74 tests passed across 3 test files (exit code 0)
- Results:
  - Typecheck: 0 errors (PASSED)
  - Vitest: 74 tests passed across 3 test files (PASSED)
- API capabilities verified: 7 capabilities promoted to `field_observed` based on real capture evidence: `clan-info`, `clan-members`, `current-war`, `war-attack-order`, `war-log`, `raid-seasons`, `raid-attack-limit-fields`.
- API capabilities still unverified: 9 capabilities remain `unverified`: `cwl-league-group`, `cwl-war` (blocked on active CWL season), `raid-attack-order` (no per-district order in API), `player-profile`, `hero-equipment`, `super-troops`, `war-preference`, `clan-games-achievement`, `player-tag-lookup` (require `--player-tag` capture).
- Security checks:
  - Code-level external directory path enforcement in `scripts/capture-fixtures.ts`.
  - Sanitizer fail-closed behavior verified for unexpected sensitive strings and tokens.
  - Relational tag mapping integrity and synthetic tag regex validation verified.
- Human approvals:
  - Phase 0 implementation plan approved.
  - Fixture review and capability approval: Pending human review.

## Blockers and Decisions
- Blocker: Requires human action to capture `--player-tag` and review sanitized fixtures. CWL capture blocked until active season.
- Decisions: DEC-001 (Registry canonical in JSON), DEC-002 (Raw capture path enforcement), DEC-003 (Git remote confirmation pending), DEC-012 (Permanent delete vs immutable evidence), DEC-013 (Deletion cleanup & backup policy), DEC-014 (Record & diagnostics classification), DEC-015 (SQLite restore sequence). Documented baseline schema in docs/schema.md.

## Next Action
Human runs the capture script with `--player-tag` when desired, reviews sanitized outputs in `./fixtures`, and grants formal Phase 0 gate approval.

## Handover Instructions
Read this file, `AGENTS.md`, and `CLASHHQ_SPEC.md` before continuing. Verify the actual files and Git status; do not assume that this document proves work is complete. Update this file after each meaningful milestone and before handing work to another session or account.