# ClashHQ — Phase 0: API Capture and Verification

> Source: CLASHHQ_SPEC.md v10, Section 10 ("Phase 0. API capture and verification").
> This file contains Phase 0 acceptance criteria, schema delta, agent tasks, and human tasks.

---

## Division of Labour

Phase 0 is explicitly split between agent-prepared tooling/docs and human-run capture/approval
(spec §10, lines 368–372).

### Agent prepares (offline, no API key needed)

1. `scripts/capture-fixtures.ts` — Standalone capture script. The human runs this with their own key.
2. `scripts/sanitizer.ts` — Deterministic, relational-preserving sanitizer.
3. `tests/sanitizer.test.ts` — Sanitizer tests using synthetic data only.
4. `shared/capabilities.json` — Machine-readable registry, all entries initially `unverified`.
5. `shared/capabilitySchema.ts` — Zod schema validating the registry structure.
6. `docs/api-notes.md` — Narrative capability documentation, all capabilities `unverified`.
7. `tests/registry-consistency.test.ts` — Tests that registry and api-notes.md agree 1:1 by ID and status.
8. `docs/phases/phase-0.md` (this file), `docs/PROGRESS.md`, `docs/DECISIONS.md`.

### Human runs (requires API key and developer portal login)

1. Log in to developer.clashofclans.com and obtain an API token bound to their current public IP.
2. Create a directory **outside** the project tree for raw captures (e.g. `C:\Users\<you>\clashhq-raw-captures\`).
3. Run `npm run capture -- --raw-output <external-path> --fixtures-output ./fixtures --clan-tag #YOURCLAN`.
4. Inspect every file in `fixtures/` to verify no real tag, name, IP, or key leaked through.
5. Review `docs/api-notes.md` and mark capabilities as `field_observed` or `behaviour_verified` where the evidence supports it.
6. Update `shared/capabilities.json` to match (or confirm the automated update by the capture script).
7. Approve the registry — this is the Phase 0 gate approval required before Phase 1 begins.

---

## Schema Delta

Phase 0 creates **no database tables and no migrations.**

The full target model is documented in `docs/schema.md` (written before Phase 1 implementation as
required by the spec), but Phase 0 does not create any of them.

All tables listed in spec §6 are deferred to their respective phases.

---

## Acceptance Criteria

Every criterion below must be verifiable and actually verified before the Phase 0 gate passes.
Status is recorded in `docs/PROGRESS.md`.

### AC-0.1 Capability Registry Structure
- [ ] `shared/capabilities.json` exists and passes Zod validation.
- [ ] Every capability from spec §12 has an entry with all required fields: `id`, `status`, `requiredFields`, `dependentFeatures`, `verificationEvidence`, `fallback`, `freshnessThresholdMinutes`, `allowPartialAcceptance`.
- [ ] All entries have `status: "unverified"` until the human approves evidence for each.
- [ ] No invented capabilities beyond those derivable from spec §§4, 5, 12.

### AC-0.2 api-notes.md / Registry Consistency
- [ ] `docs/api-notes.md` exists with one section per capability.
- [ ] Each section begins with the exact machine-checkable header: `Capability: <ID> | Status: <status>`.
- [ ] `tests/registry-consistency.test.ts` passes: every ID in the registry exists in api-notes.md and vice versa; statuses agree exactly; no duplicate IDs.

### AC-0.3 Capture Script
- [ ] `scripts/capture-fixtures.ts` exists and typechecks (`tsc --noEmit`).
- [ ] The script requires an explicit `--raw-output` argument pointing to a path outside the project.
- [ ] The script validates that the raw output path is not inside the project tree (path traversal safe, symlink-aware).
- [ ] The script never prints the API token to stdout, stderr, or any log.
- [ ] The script invokes the sanitizer before writing any fixture to the project tree.

### AC-0.4 Sanitizer Correctness
- [ ] `scripts/sanitizer.ts` exists and typechecks.
- [ ] Sanitizer maps each real tag to a consistent synthetic tag that passes the tag validation regex.
- [ ] Sanitizer maps names consistently: the same real name always produces the same synthetic name.
- [ ] Sanitizer preserves relational integrity: if player tag A appears in both a member list and a war attack record, the same synthetic tag appears in both.
- [ ] If a field cannot be reliably sanitized (unknown structure), the fixture is rejected rather than exported.

### AC-0.5 Sanitizer Tests Pass
- [ ] `tests/sanitizer.test.ts` uses only synthetic test data (no real API responses committed).
- [ ] Tests assert: real tags are absent from output; real names are absent from output; IP addresses are absent; API-key-shaped strings are absent; nested fields are sanitized; relational integrity is preserved across objects; an unrecognized sensitive field causes rejection; a previously-seen tag maps to the same synthetic value on repeated calls.
- [ ] `npx vitest run tests/sanitizer.test.ts` produces a passing result (actual output recorded in `docs/PROGRESS.md`).

### AC-0.6 Registry Consistency Test Passes
- [ ] `npx vitest run tests/registry-consistency.test.ts` produces a passing result (actual output recorded).

### AC-0.7 Typecheck Passes
- [ ] `npx tsc --noEmit` exits with code 0 (actual output recorded).

### AC-0.8 Fixture Privacy (Human Review — Not Agent-Completable)
- [ ] The human has run the capture script and reviewed every file in `fixtures/`.
- [ ] The human confirms no real player tag, clan tag, name, IP address, or API token appears in any fixture file.
- [ ] The human records this approval in `docs/PROGRESS.md` with date and scope.

### AC-0.9 Capability Evidence (Human Review — Not Agent-Completable)
- [ ] The human has updated `shared/capabilities.json` capability statuses based on the real captures.
- [ ] The human has confirmed or corrected the capability questions from spec §12:
  - War attack order field presence and behaviour.
  - Raid attack-limit and bonus-attack-limit field meanings.
  - Raid attack order across districts.
  - Hero equipment and super-troop fields.
  - War preference field.
  - Clan Games endpoint (expected: none; Games Champion achievement behaviour).
  - War log availability and retention window.
  - CWL round detail availability and expiry.
- [ ] `tests/registry-consistency.test.ts` still passes after capability updates.

### AC-0.10 Phase 0 Gate (Human Approval Required)
- [ ] All agent-completable ACs above are verified.
- [ ] Human has reviewed and approved `shared/capabilities.json` and `fixtures/`.
- [ ] `docs/PROGRESS.md` records Phase 0 status as `complete` only after human approval.
- [ ] Pre-Phase-1 required artifacts checklist (spec §0.1) reviewed and acknowledged.

---

## Evidence Path

For every capability listed in `shared/capabilities.json`:
- `verificationEvidence.docRef` → official API documentation URL or spec section reference.
- `verificationEvidence.captureDate` → date the human ran the capture (filled by the capture script or human).
- `verificationEvidence.fieldObserved` → true when the field was present in a real capture.
- `verificationEvidence.behaviourVerified` → true when behaviour (not just presence) was verified across captures.
- `verificationEvidence.testId` → the test in `tests/sanitizer.test.ts` or `tests/registry-consistency.test.ts` covering this.

A capability with `fieldObserved: false` remains `unverified`. A capability with `fieldObserved: true`
but `behaviourVerified: false` may be upgraded to `field_observed` status — it does not become `supported`
until behaviour is verified. The Phase 1 vertical slice requires at least `field_observed` (spec §12).

---

## Phase 0 Boundary (What Is Explicitly Out of Scope)

The following are **Phase 1 and later** — do not create these in Phase 0:

- Fastify server, routes, or middleware.
- React/Vite frontend.
- SQLite database file, Drizzle ORM, or any migrations.
- Application tables: settings, clans, player_identity, sync_runs, etc.
- Encrypted credential storage.
- Security middleware (Host, Origin, CSRF, CSP).
- Setup wizard.
- Phase 1 vertical slice (clan info and members mock → DB → UI).

---

## Gates Summary

| Gate | Who | Verified |
|---|---|---|
| `shared/capabilities.json` validates | Agent | [ ] |
| `docs/api-notes.md` consistency test passes | Agent | [ ] |
| Sanitizer tests pass | Agent | [ ] |
| Typecheck passes | Agent | [ ] |
| Human reviews fixtures for real data | Human | [ ] |
| Human approves capability registry | Human | [ ] |
| Pre-Phase-1 artifacts checklist reviewed | Human | [ ] |
