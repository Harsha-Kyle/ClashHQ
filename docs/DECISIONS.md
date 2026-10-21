# ClashHQ — DECISIONS.md

> This file records every architectural decision and its reason, so sessions do not decide
> the same thing differently (spec §0.1). Decisions are append-only; later decisions can
> supersede earlier ones by reference, never by editing the original entry.
> Record only decisions actually specified or explicitly approved. Do not invent new ones.

---

## Decision Index

| ID | Title | Phase | Status |
|---|---|---|---|
| DEC-001 | Capability registry source of truth | Phase 0 | recorded |
| DEC-002 | Raw capture path enforcement | Phase 0 | recorded |
| DEC-003 | Git remote confirmation pending | Phase 0 | open |
| DEC-004 | Credential storage design (cross-platform) | Pre-Phase-1 | recorded (spec-specified) |
| DEC-005 | Sync lock scope | Pre-Phase-1 | recorded (spec-specified) |
| DEC-006 | Membership inference sufficiency rules | Pre-Phase-2 | deferred |
| DEC-007 | Lock staleness and crash recovery | Pre-Phase-1 | deferred |
| DEC-008 | Local-browser Origin handling | Pre-Phase-1 | deferred |
| DEC-009 | Rule representation | Pre-Phase-3 | deferred |
| DEC-010 | Season calendar basis | Pre-Phase-3 | deferred |
| DEC-011 | Backup-flag record design | Pre-Phase-2 | deferred |
| DEC-012 | Permanent delete versus immutable evidence (privacy-erasure exception) | Phase 0 | recorded (spec §4.5, §5.2, §10) |
| DEC-013 | Deletion cleanup procedure and app-managed backup policy | Phase 0 | recorded (spec §5.2, §10) |
| DEC-014 | Membership-event and raw diagnostic classification (A/B/D/E and T) | Phase 0 | recorded (spec §4.5, §10) |
| DEC-015 | SQLite restore sequence | Phase 0 | recorded (spec §9, §9.2, §10) |

---

## DEC-001 — Capability Registry Source of Truth

**Phase:** Phase 0
**Status:** Recorded (specified in v10)
**Source:** CLASHHQ_SPEC.md §12, "Registry source of truth [v10]"; spec §13 Locked decisions; spec §14 Decisions made.

**Decision:**
`shared/capabilities.json`, validated by Zod, is the canonical source of truth for capability status,
fallback behaviour, and freshness thresholds.

`docs/api-notes.md` is the hand-maintained narrative record. Each capability section in api-notes.md
must begin with a strict machine-checkable header line in exactly this format:
```
Capability: <ID> | Status: <status>
```
The consistency test (`tests/registry-consistency.test.ts`) parses only these header lines by
capability ID. A capability present in one file and absent from the other, a duplicate ID, or a
status mismatch fails the test.

**Reason:** Specified as a locked decision in v10. Prevents divergence between machine-readable
registry and human narrative documentation. Ensures tests can verify consistency mechanically
rather than relying on manual synchronization.

**Consequences:**
- Application code reads `shared/capabilities.json` only, never `docs/api-notes.md`.
- Every change to a capability status must update both files and re-run the consistency test.
- The consistency test is a permanent gate from Phase 0 onward.

---

## DEC-002 — Raw Capture Path Enforcement

**Phase:** Phase 0
**Status:** Recorded
**Source:** CLASHHQ_SPEC.md §10 "Privacy boundary for capture"; §15 "Security and privacy".

**Decision:**
The capture script (`scripts/capture-fixtures.ts`) enforces at runtime that the `--raw-output`
path is not inside the project tree. This is a code-level enforcement, not a `.gitignore` rule.

Enforcement mechanism:
1. Resolve both the raw output path and the project root to their real absolute paths
   (using `fs.realpathSync` where the path exists, or `path.resolve` where it does not yet exist).
2. Reject the path if the resolved raw output path starts with the resolved project root.
3. Additionally reject if any ancestor of the raw output path is a symlink that resolves inside
   the project tree.
4. On rejection, exit with code 1 and a clear error message — never fall back to a default path.

The API token is never printed to stdout, stderr, or any log file. Error messages from API
responses are sanitized before logging (no authorization header values, no token echoed back).

**Reason:**
Raw captures may contain real player tags, names, and potentially IP addresses embedded in
error responses. Keeping them outside the repository tree prevents accidental git commits.
Code-level enforcement is more reliable than `.gitignore` because `.gitignore` does not prevent
`git add --force` and does not prevent other tools from reading the files.

**Consequences:**
- The human must create an external directory before running the capture script.
- The capture script will fail explicitly if an external path is not provided or resolves inside the project.

---

## DEC-003 — Git Remote Confirmation Pending

**Phase:** Phase 0
**Status:** Open — requires human confirmation
**Source:** CLASHHQ_SPEC.md §0.1 "Phase checkpoint": "If no remote is configured, stop and confirm the correct URL before adding one."

**Context:**
`PROJECT_STATE.md` records `https://github.com/Harsha-Kyle/ClashHQ` as the GitHub remote.
This has not been verified as reachable or configured in the local workspace. No Git repository
has been initialized in this workspace yet.

**Pending action:**
The human must confirm the correct remote URL before the first phase checkpoint commit.
The agent will not initialize a Git repository or add a remote without explicit approval.

---

## DEC-004 — Credential Storage Design (Cross-Platform)

**Phase:** Pre-Phase-1 (must be recorded in docs/security.md before Phase 1 implementation)
**Status:** Recorded (specified in v10; implementation deferred to Phase 1)
**Source:** CLASHHQ_SPEC.md §9.3 "Credential design decision (single cross-platform design) [v10]".

**Decision (verbatim from spec):**
v1 uses one design on Windows, macOS and Linux:
- (a) The encryption key is a random 256-bit key held in a local key file in the data folder —
  no OS keychain integration, no user passphrase, no derivation from machine identifiers in v1.
- (b) The key file contains a non-secret random key identifier (key_id) alongside the key,
  and the encrypted blob stores the key_id of the key that encrypted it.
- (c) "Key file replaced with a different key" is detected by key_id mismatch between blob and
  key file, and independently by AES-GCM authentication-tag failure.
- (d) Every detected failure path (key file missing, blob missing, key_id mismatch, auth-tag
  failure) leads to the same re-enter flow, never a crash and never a partial-secret leak.
- (e) Owner-only file permissions applied where the OS supports them (POSIX 0600; on Windows
  documented best-effort ACL behaviour with limitation stated in docs/security.md).
- (f) The only credential material in a backup is none — encrypted blob and key_id reference
  removed from backup copy; no key file included.

Any future change to this design requires a new decision entry here, not a change while coding.

---

## DEC-005 — Sync Lock Scope

**Phase:** Pre-Phase-1 (documented here; implemented in Phase 2)
**Status:** Recorded (specified in v10)
**Source:** CLASHHQ_SPEC.md §4.3 "Lock scope"; §13 Locked decisions.

**Decision (verbatim from spec):**
One lock per (clan, endpoint) pair, held by the sync service and backed by a durable operation
record so it survives restarts. Stale locks expire safely after a documented timeout. Crash
detected on startup. Different clans and endpoints may run concurrently up to the global limit.
A second request for a locked scope waits or is refused with a clear message. Writes use short
transactions because SQLite allows a single writer.

---

## DEC-006 — Membership Inference Sufficiency Rules

**Phase:** Pre-Phase-2 (must be in docs/DECISIONS.md and docs/schema.md before Phase 2 implementation)
**Status:** Deferred — not yet recorded
**Source:** CLASHHQ_SPEC.md §5.2 "Membership inference sufficiency rules [v10]".

*To be recorded before Phase 2 implementation begins.*

---

## DEC-007 — Lock Staleness and Crash Recovery

**Phase:** Pre-Phase-1
**Status:** Deferred — not yet recorded
**Source:** CLASHHQ_SPEC.md §4.3 "Lock staleness and crash recovery [v10]".

*To be recorded in docs/DECISIONS.md and docs/schema.md before Phase 1 implementation begins.*

---

## DEC-008 — Local-Browser Origin Handling

**Phase:** Pre-Phase-1
**Status:** Deferred — not yet recorded
**Source:** CLASHHQ_SPEC.md §9.1 "Origin handling for legitimate local use [v10]".

*To be recorded in docs/security.md and docs/DECISIONS.md before Phase 1 implementation begins.*

---

## DEC-009 — Rule Representation

**Phase:** Pre-Phase-3
**Status:** Deferred
**Source:** CLASHHQ_SPEC.md §5.15 "Rule representation [v10]".

*To be recorded in docs/rules.md and docs/DECISIONS.md before Phase 3 implementation begins.*

---

## DEC-010 — Season Calendar Basis

**Phase:** Pre-Phase-3
**Status:** Deferred
**Source:** CLASHHQ_SPEC.md §5.10 "Season calendar basis [v10]".

*To be recorded in docs/DECISIONS.md and docs/schema.md before Phase 3 implementation begins.*

---

## DEC-011 — Backup-Flag Record Design

**Phase:** Pre-Phase-2
**Status:** Deferred
**Source:** CLASHHQ_SPEC.md §5.2 "Backup-flag record [v10]".

*To be recorded in docs/DECISIONS.md and docs/schema.md before Phase 2 implementation begins.*

---

## DEC-012 — Permanent Delete versus Immutable Evidence (Privacy-Erasure Exception)

**Phase:** Phase 0
**Status:** Recorded (specified in v10)
**Source:** CLASHHQ_SPEC.md §4.5 "Privacy-erasure exception to immutability", §5.2 "Deletion of shared records", §10 Phase 0.

**Decision:**
Immutability (Class A, C, D append-only) never blocks the documented permanent-delete policy. Permanent delete is a narrowly scoped, audited privacy-erasure operation that may redact identity-bearing fields in otherwise immutable records (replacing them with a stable placeholder, e.g. "Deleted player 0007") and purges Class T payloads.
- The exception is strictly limited to identity-bearing fields; evidence values, timestamps, and aggregates remain untouched.
- Shared historical events (war attacks, raid contributions, rosters, lineups, eligibility, ledger entries) reference an internal `player_id`, never the tag as their identity, and normalized historical tables do not duplicate the original tag.
- Permanent delete removes the tag mapping in `player_identity` and replaces it with the stable placeholder so event rows and aggregates stay intact while the original tag is removed from the app's retained data.
- Specific record breakdown per spec §5.2:
  - **Removed:** Profile and profile observations, notes, personal excuses, same-person links, personal cached raw payloads (Class T), progression and counter observations.
  - **Anonymized (same stable placeholder across all of the player's rows):** Attack rows, raid contribution rows, roster and lineup rows, eligibility records, transfer ledger entries, audit and correction records mentioning the player.
  - **Retained unchanged:** Shared war, CWL, and raid records and their aggregate results, other players' rows and corrections.
- Deleting one player never erases another player's correction history.
- Season counters and caches for affected clans are rebuilt afterwards.
- Logical deletion only: the product discloses that old storage pages, SSD slack, filesystem snapshots, and prior backups/exports are outside its control.

---

## DEC-013 — Deletion Cleanup Procedure and App-Managed Backup Policy

**Phase:** Phase 0
**Status:** Recorded (specified in v10)
**Source:** CLASHHQ_SPEC.md §5.2 "Deletion cleanup procedure", "App-managed backup policy on deletion", §10 Phase 0.

**Decision:**
"No recoverable trace in the active data" is an operational guarantee implemented as a concrete, six-step transactional sequence:
1. **Redact:** Redact identity-bearing fields inside a transaction (the privacy-erasure exception to immutability, §4.5).
2. **Purge:** Purge every Class T (raw diagnostic) record mentioning the player's tag.
3. **Quiesce:** Stop accepting new write operations touching affected rows; wait for or cancel in-flight operations.
4. **Checkpoint & Compact:** Checkpoint and truncate the WAL so no pre-redaction page remains in the WAL, then run the database's own compaction (VACUUM or equivalent) so freed pages from redacted rows are reclaimed rather than left as recoverable slack in the live file.
5. **Reopen:** Close and reopen the database connection so no stale in-memory or page-cache copy of the original value is served afterward.
6. **Verify:** Search the live database file, post-checkpoint WAL/sidecar files, a fresh backup, and a fresh export for the original tag.

**App-managed backup policy on deletion:**
- Any ClashHQ-managed backup file still on disk (in `data/` or a configured backup folder) taken before the deletion and known to contain the deleted player's identity is flagged in the UI at the time of deletion, with two choices: delete the flagged backup(s) now, or keep them with an explicit on-screen acknowledgement that they still contain the original identity until removed.
- ClashHQ never auto-deletes a backup silently; deleting a backup is always an explicit, confirmed action.
- Flagging uses the backup registry's `player_id` list (spec §5.2); no backup file is opened or searched for the tag. The user's delete-or-keep decision is stored as an audit record keyed to the backup id and placeholder, never the original tag.
- Backups or exports copied outside the app's managed folder are outside the app's control and cannot be found, flagged, or recalled.

---

## DEC-014 — Membership-Event and Raw Diagnostic Classification (A/B/D/E and T)

**Phase:** Phase 0
**Status:** Recorded (specified in v10)
**Source:** CLASHHQ_SPEC.md §4.5 "Record classes and identity separation", "Membership has one canonical representation", §10 Phase 0.

**Decision:**
Membership tracking and diagnostic storage follow strict single-class rules:
- **Snapshots (`clan_members_snapshot`):** Class A (immutable source observation, append-only).
- **Manual membership events (`membership_events`):** Class B (manual input, append-only, separately identifiable).
- **Inferred transitions (`membership_transitions`):** Class D (derived evaluation, versioned interpretations linking exact snapshot pairs and inference version).
- **Membership intervals (`membership_intervals`):** Class E (rebuildable view derived from Class A, B, and D records; never independently edited).
- **Raw diagnostics (`raw_api_debug`):** Class T (temporary diagnostics; disposable, retention-limited, pruned by documented retention setting and immediately purged on player deletion; never treated as evidence).

---

## DEC-015 — SQLite Restore Sequence

**Phase:** Phase 0
**Status:** Recorded (specified in v10)
**Source:** CLASHHQ_SPEC.md §9 "Restore sequence", §9.2 "Restore and migration failure handling", §10 Phase 0.

**Decision:**
Restore validates the uploaded file (size, integrity check, schema version), shows its contents, and requires explicit user confirmation before replacing. The restore sequence executes in 8 concrete steps:
1. Validate the uploaded backup (size, integrity check, schema version).
2. Run migration dry run on a temporary copy.
3. Stop accepting new operations and wait for or cancel in-flight ones.
4. Quiesce and close all database connections (checkpoint the WAL).
5. Preserve an automatic safety copy of the current database.
6. Replace the database using a same-filesystem atomic rename where supported (never a copy over an open file).
7. Reopen, verify integrity and schema, run migrations.
8. Resume service.

If any step fails, keep or restore the original database from the safety copy and report the actual failure. The server restarts or re-initializes its connections after replacement so no stale file handle remains.
