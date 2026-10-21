# ClashHQ — Database Schema & Record Classification

> Authoritative specification reference: CLASHHQ_SPEC.md v10 §§4.5, 5.2, 6, 9, 10.
> Phase 0 baseline record classification, retention boundaries, table definitions, and view rebuild logic.

---

## 1. Record Classification Rules (§4.5)

Every table in docs/schema.md is classified as exactly one of:

| Class | Name | Write Rules | Definition & Retention Rules (§4.5) |
|---|---|---|---|
| **A** | Immutable Source Observation | Append-only | API snapshots and normalized API observations. Append-only; subject only to the narrowly scoped §4.5/§5.2 privacy-erasure exception. |
| **B** | Manual Input | Append-only (supersede/reverse) | Manual entries, imports with manual provenance, manually entered membership events. Never represented as official API evidence. |
| **C** | Correction & Reconciliation | Append-only (supersede/reverse) | Scoped corrections, reconciliation decisions, delete-or-keep backup decision records. Append-only with supersede/reverse records. |
| **D** | Derived Evaluation | Append-only | Versioned calculations, inferred membership transitions. Append-only; new evaluations produce new records, never rewrites. |
| **E** | Rebuildable Cache or View | Droppable & rebuildable | Droppable and rebuildable from Class A–D records at any time. A test rebuilds every cache and compares. |
| **T** | Temporary Diagnostics | Disposable & retention-limited | Disposable, retention-limited (default retention 14 days, configurable; pruned by privacy deletion). Never treated as evidence. |

---

## 2. Table Inventory (§4.5, §5.2, §6, §10)

For each table, this registry records its single class, write permissions, retention policy, deletion behaviour (§4.5, §5.2, §6), and introducing phase:

| Table Name | Class | Write Permissions | Retention Policy | Deletion Behaviour (§4.5, §5.2, §6) | Phase |
|---|---|---|---|---|---|
| `settings` | C | Update by user / app | Permanent (except credential blob) | Configuration and settings. Stored encrypted API key blob is removed during backups (§9.3) and cleared on auth replacement. | Phase 1 |
| `schema_version` | A | Append-only | Permanent | Migration tracking. Retained permanently for schema integrity verification. | Phase 1 |
| `clans` | A | Insert / Update metadata | Permanent | Clan profiles and metadata. RESTRICT on delete where historical child records exist. | Phase 1 |
| `player_identity` | A | Insert / Privacy redact | Permanent | Maps internal `player_id` to normalized tag. On permanent delete, tag mapping is removed and replaced by stable placeholder string (§4.5, §5.2). | Phase 1 |
| `clan_members_snapshot` | A | Append-only | Permanent | Source observations. Retained permanently; identity-bearing fields redacted to placeholder on permanent delete (§5.2). | Phase 1 |
| `sync_runs` | A | Append-only | Permanent | Scoped per clan/endpoint. Immutable record of sync operations. | Phase 1 |
| `sync_run_results` | A | Append-only | Permanent | Status and metrics per sync operation. RESTRICT on delete. | Phase 1 |
| `sync_operation_records` | A | Append-only | Permanent | The sync operation record table holding lifecycle state, idempotency key, and heartbeat (§10 Phase 1 inventory). | Phase 1 |
| `raw_api_debug` | T | Insert / Auto-purge | Configurable retention (default 14 days) | Class T diagnostics. Pruned per retention rule; purged immediately on player deletion if mentioning player tag (§5.2). | Phase 1 |
| `backup_registry` | A | Append-only | Permanent | Records `backup_id`, `created_at`, `file_name` in managed folder, `schema_version`, and list of internal `player_id`s at creation (§5.2). Excluded from credential backups. | Phase 2 |
| `backup_flag_decisions` | C | Append-only | Permanent | Audit records of user delete-or-keep decisions keyed to `backup_id` and placeholder, never original tag (§5.2). | Phase 2 |

*Note: All other domain tables in spec §6 (wars, CWL, raids, rules, transfers, corrections) are deferred to their respective phases per spec §10.*

---

## 3. Views & Rebuildable Caches (§4.5, §5.2)

For each view and cache, this section records source tables and deterministic rebuild logic:

### `membership_intervals` (Class E View)
- **Source Tables:**
  - `clan_members_snapshot` (Class A)
  - `membership_events` (Class B, manual membership events)
  - `membership_transitions` (Class D, inferred membership transitions)
- **Deterministic Rebuild Logic:**
  - Derived from Class A snapshots, Class B manual events, and Class D inferred transitions.
  - Consumes Class D inference records linking consecutive successful, complete snapshots.
  - Droppable and rebuildable at any time; never independently edited (§4.5).
  - A test asserts identical rebuild from source records (§4.5).

### Clan & Season Reporting Caches (Class E Caches)
- **Source Tables:** Class A source observations, Class B inputs, Class C corrections, Class D evaluations.
- **Rebuild Triggers:** Recalculation, ruleset changes, manual corrections, or post-deletion cleanup (§5.2).

---

## 4. Foreign-Key Behaviour & Deletion Rules (§4.5, §5.2, §6)

- **PRAGMA foreign_keys = ON:** Enforced on every database connection; a test fails if enforcement is off (§6, L317).
- **Rules per Relationship Type (§6, L317):**
  - **RESTRICT:** Wherever deletion could destroy history.
  - **CASCADE:** Only for dependent private records safe to remove (e.g. personal notes, profile observations, personal excuses).
  - **Explicit Anonymization:** For shared historical events (war attacks, raid contributions, rosters, lineups, eligibility, ledger entries). Shared historical tables reference internal `player_id`. When permanent delete runs (§5.2), shared records and aggregates remain intact while identity-bearing fields are replaced with the stable placeholder string.
