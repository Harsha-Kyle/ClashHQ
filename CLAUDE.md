# CLAUDE.md — ClashHQ Standing Rules (v10)

> This file contains the verbatim standing rules extracted from CLASHHQ_SPEC.md (v10),
> as mandated by the spec's "How to use this brief" section (sections 0, 1, 2, 4, 4.1–4.5,
> 5.10, 9, 11, 12, 13 and 15). Per-phase content lives in docs/phases/phase-N.md.
> AGENTS.md at the repo root is an additional enforceable rules overlay from the workspace
> configuration and does not conflict with this file.
>
> **Session start protocol**: "Read CLAUDE.md, docs/PROGRESS.md and docs/phases/phase-N.md,
> verify the local project state, then continue."

---

## How to use this brief

This document is long. Long briefs degrade agent output, so do not paste it whole into every session.

Put sections 0 (the protocol parts), 1, 2, 4, 4.1-4.5, 5.10, 9, 11, 12, 13 and 15 into CLAUDE.md at the repo root. These are the standing rules. Put each phase from section 10 into its own file (docs/phases/phase-0.md ... phase-8.md), together with the feature sections that phase needs (for example 5.6 for the raid phase). Feed the agent one phase at a time. Do not start a phase until the previous one passes its gate. Phase 0 is run by the human, because the agent has no API key and the developer portal needs a login. Section 10 (Phase 0) defines exactly which Phase 0 work is the agent's and which is the human's.

---

## 0. Protocol and Session Rules

### 0.1 Local-first, multi-session and multi-account execution

The project is built across many short sessions and possibly different AI coding accounts (for example free-tier accounts that rotate when quota runs out). The agent works directly on the local project folder. No account or agent retains memory of a previous session.

**Single source of truth (local-first).**

The local project folder is the working source of truth. Chat history, model memory and verbal claims of completion are not. Git is not part of the everyday loop. Do not commit, push, pull or branch routinely. Git and the GitHub remote are used only (a) at a human-approved phase checkpoint and (b) at release or deployment, to store the code. Before editing, inspect the local state: the files present, docs/PROGRESS.md, docs/DECISIONS.md, the current phase file and the relevant tests. If a Git repository exists, git status --short --branch may be read for information; it is never a reason to reset, clean, discard or overwrite anything. Never overwrite another session's local work without explicit human approval. A new account is not evidence that work was saved. Verify the files actually on disk before continuing.

**One active writer.**

Only one agent modifies the project folder at a time. Other accounts may review or research but must not modify the same files. Never split simultaneous editing of docs/schema.md, migrations, shared calculation services or the capability registry across accounts (highest-conflict areas). The human is the integration owner and approves phase completion.

**Local safety net (no Git needed).** Because work is not committed continuously, the agent keeps the folder recoverable.

**Checkpoint triggers.** A local checkpoint copy is required, not optional, before: any schema or migration change; any change touching docs/schema.md, the capability registry, or a shared calculation/rules service; any refactor or task that will touch more than roughly 5 files in one sitting; and any operation described elsewhere in this document as "risky" (restore, bulk delete, demo/real mode changes to shipped code). It is not required before a single-file, non-schema edit. When in doubt, make the copy — a checkpoint is cheap and a lost session is not. Checkpoint exclusions. Checkpoint copies exclude: data/, node_modules, all key files, .env and any other file holding secrets, raw (unsanitized) API captures, logs, exports or diagnostic bundles containing real player data, temporary uploads, and existing database backups. A checkpoint copy is source and config only — never a second copy of sensitive or generated material. Checkpoint naming and retention. Name each checkpoint folder with a UTC timestamp and the triggering task (e.g. checkpoints/2026-10-19T1420Z-schema-cwl-rosters/). Keep at most the last 5 checkpoints; when a 6th is made, delete the oldest. A checkpoint is never deleted automatically if it is the only one and the project is in a known-broken state — in that case leave it and tell the human in docs/PROGRESS.md. Record every checkpoint's location in docs/PROGRESS.md. The progress note records the path only — never credentials, never a real player tag, name or any other identifying field, even inside a "what changed" summary. The human may also keep an OS-level backup. Never rely on an uncommitted working tree being the only copy of finished phase work: the phase checkpoint below exists to fix that.

Suggested account roles (adapt to the product's actual quota and workspace rules): (1) main implementer: owns the project folder, implements and tests; (2) reviewer/tester: reviews specific files or a diff of a named change, reports findings without rewriting the same files; (3) documentation and test-design assistant: drafts capability checks, schema review questions and test cases as proposals; (4) independent acceptance reviewer: checks whether acceptance criteria actually pass before the human approves a phase. Reviewers receive the actual files or an exported diff, never just a description. Do not use multiple accounts to bypass usage restrictions; treat quota as a limited resource and spend it on bounded tasks with measurable outputs.

**Mandatory handoff.** At the end of every session (including when quota runs out) update docs/PROGRESS.md with:

- Current phase and status, and the exact task.
- Location of the latest local checkpoint copy, and the last Git phase-checkpoint commit hash if one exists.
- What is implemented; files created or changed this session.
- Commands actually run and their real results.
- Tests that failed, were not run, or are not yet applicable.
- Known bugs, blockers, unresolved decisions and open questions.
- The next three concrete steps, with the files to inspect or edit, and the commands to resume.
- Whether the project folder is in a safe, buildable state.

docs/DECISIONS.md records every architectural choice and its reason, so sessions do not decide the same thing differently.

**Mandatory resume.** Start every session with: "Read CLAUDE.md, docs/PROGRESS.md and docs/phases/phase-N.md, verify the local project state, then continue." Run the smallest relevant check before editing. If the handoff conflicts with the files or tests on disk, investigate and document the discrepancy rather than guessing.

**Working-state quality gate.** "Working" means the sub-step's relevant tests pass and the app builds. Mark unfinished states in docs/PROGRESS.md as WIP. Never put API keys, unredacted captures, real player data, database files, backups or encryption-key files anywhere inside the project tree that Git could pick up (data/ and captures live in git-ignored or external locations). If a session ends with failing tests, write the exact failures into docs/PROGRESS.md and leave the folder recoverable. Never mark a phase complete, or start the next, while its gate is failing.

**Phase checkpoint (the only routine Git moment).** When a phase passes its gate and the human approves it:

Run a secrets and private-data scan over the files to be committed (API keys, tags/names from real captures, databases, backups, key files, logs). git status --short, git diff --check, review the diff; stage only intended files by explicit path (never git add . blindly). git diff --cached; commit with a message naming the phase; push the current branch to the remote. Record the commit hash in docs/PROGRESS.md as the phase's checkpoint. The agent prepares these commands and the human runs or approves them. If no remote is configured, stop and confirm the correct URL before adding one.

**Context and quota discipline.** One small, testable task per session; split each phase into sub-steps small enough to finish inside one session. Do not implement an entire phase in one response. Prefer minimal patches over broad rewrites; do not rewrite completed files to match a preferred style; no unrelated refactoring.

**Investigate before inventing; no silent scope growth.** For every feature that depends on the official API, first check the official documentation and the Phase 0 fixtures; never fabricate an endpoint, field or history source. Add no features, libraries, services or infrastructure beyond this brief without stating the reason, the smallest solution and the scope change in docs/DECISIONS.md.

**Phase status is separate from file and Git state.** Files existing or a commit existing is never proof a phase passed. docs/PROGRESS.md keeps a per-phase status (not started, in progress, blocked, complete), set to complete only after every applicable acceptance criterion passes and the human has reviewed the result. A completed phase records: checkpoint commit hash, actual test output, outstanding failures and any explicitly approved exceptions (who, when, why). Chat summaries and generated plans do not count as implementation.

**Applicable gates.** Every applicable gate must pass before a phase is complete. A gate that cannot apply yet (for example lint, typecheck or build before the foundation exists) is marked "not yet applicable" in docs/PROGRESS.md with the reason; never silently skipped, never reported as passed. Once Phase 1 establishes a check, it is mandatory for every later phase.

**Per-phase planning artifacts [v10].** Before implementing any phase, the agent writes into that phase's file (docs/phases/phase-N.md): (a) feature-by-feature acceptance criteria, (b) the schema delta (exact tables and migrations the phase adds, and which target-model tables remain deferred), and (c) for every data feature, the evidence path to be tested before its presentation. A chart, table or profile is not complete until its values can be traced to source observations, corrections and calculation versions. At every gate the report lists the exact test commands and outcomes, distinguishing tests that ran from tests merely added, and platform builds actually verified from platforms only represented in CI configuration.

**Pre-Phase-1 required artifacts [v10].** Phase 1 implementation does not start until these exist and the human has seen them: (1) Phase 0 approval evidence and the approved capability registry; (2) the Phase 1 table and migration inventory (see Phase 1); (3) the named vertical slice, with its fixture and outcome matrix (see Phase 1); (4) the credential encryption and re-entry decision, recorded in docs/security.md and docs/DECISIONS.md (see 9.3); (5) the capability registry source-of-truth decision (see 12).

**Design decisions recorded before the relevant phase [v10].** The agent records each of the following in docs/DECISIONS.md (and the named doc) before implementing the feature that depends on it. They are clarifications of rules already in this brief, not new features: membership inference sufficiency rules (5.2); lock staleness and startup recovery (4.3); local-browser Origin handling (9.1); the rule representation (5.15); the season calendar basis (5.10); the backup-flag record (5.2).

---

## 1. Role and Goal

You are a senior full-stack engineer. Build ClashHQ, an open-source, self-hosted Clash of Clans management web app that combines what clan-stat sites, war trackers and CWL planners do into one local website. It must be production quality, documented, tested and ready to publish on GitHub so anyone can clone it and run it without problems.

The target user manages one to several real clans (including sister clans that share players during CWL) using only the official Clash of Clans API. The app must never invent data, corrupt historical stats, or ship a feature that is only a UI mock.

---

## 2. Hard Rules (Non-Negotiable)

Nothing hard-coded: no API key, clan tag, clan name, player name or real IP address anywhere in source, tests, seeds or docs (use placeholders like #CLANTAG in docs; test fixtures use synthetic tags that pass tag validation). 127.0.0.1 and fake addresses in tests are allowed. Each user supplies their own official API key (developer.clashofclans.com) via a Settings screen. The key may be typed into the browser and submitted over loopback to the local backend, which encrypts and stores it. It is never logged, never sent anywhere except the official API, and after submission never returned to the browser except masked (e.g. ••••a3f9). It never appears in logs, error responses, exports, diagnostic bundles or backups, in plaintext or encrypted form. Storage locations are defined in 9.3. Clans are added by tag in Settings, unlimited count (no application-level cap; this does not mean unlimited API requests, see 4). Each clan gets its own dashboard and stats. Clans can optionally be placed in user-defined Clan Groups (5.1). Storage is a local SQLite file (zero setup). Path configurable by env var, default ./data/app.sqlite, resolved relative to the project root (not the launch directory) unless absolute. data/ is git-ignored. The encryption key file always lives in the same data folder as the database. Data collection is manual: a Sync now button (per clan and for all clans). The sync code is an isolated service so a scheduler can be added later without refactoring. First run is clean: clone, one install command, one start command, open the browser, land on a setup wizard (paste API key, add first clan tag). No manual DB creation, no source edits. Handle the IP-locked key problem gracefully. On access-denied or invalid-IP errors, show a clear message that the key must be created for the user's current public IP, with a link to the developer portal; if the API error contains the IP, show it. Offer (a) a copyable command the user runs themselves (e.g. a curl to a public IP-echo service), and (b) an optional "Look up my IP" button triggered only by a click, with a disclosure first ("this contacts a third-party service; your API key is NOT sent"). The app contacts no host other than the official API except through that explicit button.

---

## 3. Recommended Stack

TypeScript end to end.

Runtime: Node.js 24 LTS (or a newer explicitly supported LTS). Pin the major in .nvmrc, package.json engines, Dockerfile and CI. Do not target an End-of-Life Node.js (Node 20 is EOL). Document how to upgrade the pin. Before locking dependencies, confirm the chosen better-sqlite3 version ships prebuilt binaries for the pinned Node on Windows, macOS and Linux, otherwise one-command install breaks for Windows users without build tools. Backend: Fastify with Zod validation. Database: SQLite via better-sqlite3 with Drizzle ORM; Drizzle migrations run automatically on startup. Frontend: React + Vite + TypeScript, Tailwind CSS, TanStack Table, Recharts, dark/light theme. Single command run: the backend serves the built frontend; one process, one port (default 3000, configurable). Optional Docker: Dockerfile and docker-compose.yml mounting a volume for the SQLite file and key file. Quality: ESLint, Prettier, Vitest, Playwright smoke tests, GitHub Actions CI (lint, typecheck, test, build).

User quick start must be exactly: git clone <repo>, cd clashhq, npm install, npm start (npm start builds if needed, runs migrations, starts the server).

Target platforms for v1. Windows, macOS and Linux are all committed v1 targets, not a stretch goal — the one-command install, native better-sqlite3 binary check and CI build matrix in section 8 cover all three from Phase 1 onward. This was reaffirmed, not newly decided, because dropping a platform late would silently invalidate the Phase 1-8 gates that already assume it; if quota or time pressure makes this infeasible, record the reduced scope explicitly in docs/DECISIONS.md rather than letting platform support quietly degrade.

---

## 4. Official API Facts the Design Must Respect

Use only the official API (https://api.clashofclans.com/v1) with the user's key as a Bearer token. No third-party game-data APIs, no scraping, no undocumented or private endpoints. Endpoints: clan info and members, current war, war log, CWL league group and CWL war, capital raid seasons, player info, player tag lookups.

The API mixes current-state resources, detailed war and CWL records, raid-season records and historical summaries. Availability and retention differ by endpoint. Design around these limits:

Do not assume every event is permanently retrievable or that every response has every field a feature needs. During each sync, retrieve and persist the available event details before they expire. Use snapshots for what the API does not keep as history (membership transitions, counters, lineups at points in time). Always distinguish retrieval (the API returned it) from snapshot-based reconstruction (the app inferred it from two captures). Member join and leave events are not provided; they exist only as differences between snapshots. A clan's war log can be private; handle this and show which clans have it hidden. No true "last seen" timestamp exists. Infer activity from observed changes across syncs and label it "last observed active", never exact online time. Rate limits: queue requests, cache responses for a short TTL, show sync progress and errors per clan. Bounded concurrency and a visible queue; many clans means a longer queue, not a higher request rate. Retry policy: respect rate-limit and Retry-After headers; bounded retries with exponential backoff and jitter for transient failures only; never retry authentication, permission or validation errors; request timeout and concurrency limit; no wasteful polling; the user can retry a failed sync without restarting. Defaults for timeouts, retries and concurrency are configurable and justified in docs/api-notes.md from the official documentation, not invented. Tags must be URL-encoded (# becomes %23) and normalised (uppercase, leading #, letter O to digit 0). After normalising, validate against the permitted character set and length; reject malformed tags with a clear error instead of silently repairing arbitrary input. Names, clan names, badges and other profile fields are mutable. The tag is canonical. Store them as time-stamped observations, never as identity.

### 4.1 Data Trust and Sync Rules

Every metric carries two provenance fields. metric_method: direct, snapshot_observation, derived or manual. evidence_source: official_api, captured_snapshot, manual_entry, or a list of linked evidence records. A derived value records exactly which snapshots and which formula version produced it. Never fabricate missing history. A value that cannot be calculated from captured data shows Unknown / not captured with a reason, never 0. Per clan and per endpoint show: last attempted sync, last successful sync, status, and whether history is complete since the clan was added. "Sync all clans" ends with a summary of succeeded, failed and skipped clans. If one clan succeeds and another is rate-limited, keep the successful data, record the partial failure, and allow retry of only the failed parts without duplicating results. Each endpoint operation is idempotent, uses stable source identifiers, and records per-endpoint commit status. Before building any feature, verify the endpoint and fields (Phase 0, section 12) and record the result in docs/api-notes.md and the machine-readable registry (12). If a field is not exposed, mark the feature unavailable or offer manual entry. Every snapshot stores its capture time. Syncs are idempotent. Joins and leaves are inferred between snapshots, so a player who joins and leaves between two syncs may never be seen. Say this in the UI. If a war or raid ended before the clan was added, recover only what the API still returns and label the rest "not captured". The user can add or import missing war and raid records by hand, labelled manual_entry. The app records and displays; it never moves players in-game. CWL and Clan Games data expire. The CWL league group exposes only the current season and round details disappear, so "sync every round" is first-class: during CWL a prominent banner asks the user to sync every round, tracks which of the 7 rounds were captured (missed rounds labelled "not captured") and shows a per-round capture checklist. Clan Games need a baseline snapshot at the start and an end snapshot; prompt at both moments. Own clans only. Opponents are stored only with the fields needed to display the war record and its result (name, tag, badge, size, result, attack results). No opponent player profiles, opponent stats, opponent syncing or rival tracking.

**Source reconciliation.** The API response is source evidence, not a guarantee of completeness or recoverability. Store API observations, manual entries, corrections and derived results as distinct records. Recompute derived metrics from retained evidence using a versioned formula. Manual corrections never overwrite or delete source evidence. When sources conflict, preserve both, mark the result conflicted or uncertain, and require explicit resolution where needed. Never silently merge records whose canonical identity is uncertain.

**Source-of-truth hierarchy.** (1) Official API evidence, with capture time. (2) Derived calculations, recomputed using a versioned formula. (3) Manual entries and corrections, preserved as separate audited records with explicit scope. (4) Presentation state, showing the best-supported result including uncertainty and conflicts without altering evidence. A manual excuse changes the classification of a miss, never the attack evidence. A newer API response improves the evidence record and never silently deletes a leader's correction.

**Availability levels are separate.** For wars: (a) a summary exists in the war log; (b) detailed attack records are retrievable; (c) attack order and lineup evidence are available; (d) the record was captured by ClashHQ while the war was active. A summary never implies detailed attacks, lineups or order. Distinguish "unavailable from the API" from "never captured by the app".

**Four-layer model.** Keep strictly separate: Observation (what the API or a human supplied), Calculation (what a versioned formula or ruleset derived), Correction (a separate audited decision about classification or display), Presentation (the best-supported result including uncertainty and conflicts). A calculation never becomes source evidence; a correction never modifies the original observation. Corrections state scope: one event, one season, or all future calculations.

**Permanent evidence versus temporary diagnostics.** Every API field used by any feature is preserved in immutable normalized observation records with source identifiers, capture timestamps and a parser/schema version. Complete raw JSON is temporary diagnostics only (section 11, class T in 4.5). If a field was never normalized and its raw payload has expired, that value is Unavailable. A parser change never silently reinterprets older observations.

**Sync safety.** Each endpoint operation records its operation and source IDs before being marked committed, so retry is safe after a crash. Two overlapping syncs cannot run for the same clan and endpoint. A user edit during a sync never corrupts either. A sync can be cancelled safely and leaves no partially committed record. A valid-JSON response missing required fields is recorded as partial or failed, never success. Never infer missing history from current state: a missed capture is a gap, filled later only when identity and historical meaning are demonstrably reliable; an event no longer returned is not proof it never happened.

**Time.** Store all timestamps in UTC, keep original source timestamps where useful, convert to the configured time zone only for display and export. Season assignment uses official identifiers or documented canonical boundaries, never the machine's local clock. Tests cover daylight-saving changes, different machine time zones, season boundaries, late or imported captures, and date-only versus precise timestamps. Provisional seasons: if the end time (or other field that decides the season) is not yet known, the season is marked provisional; it becomes canonical and immutable only once the deciding timestamp or official identifier is known. Provisional records are excluded from season counters (or shown separately, labelled provisional), never counted into a possibly wrong season.

### 4.2 Correction Lifecycle

A correction is a first-class audited record.

It applies to a specific entity, field and scope (one event, one season, or all future calculations). It is never applied automatically to related metrics; if one correction should affect several metrics, each effect is listed explicitly in the correction record. It can be superseded or explicitly reversed; both add new audit records and nothing is edited or deleted. The full chain stays queryable. It can become stale when a later API observation changes the evidence it was based on. The app detects this, marks it "needs review", keeps applying it until the leader decides, never hides the conflict, and surfaces it in Needs attention (5.14). The inspection view (5.14) always shows four things side by side: the original observation, the correction (actor, time, reason, scope, status), the latest observation, and the value used in presentation with the reason it was chosen. It also shows the correction status (active, superseded, reversed, needs review) and the evidence records used. Recalculating derived metrics re-applies active corrections and never silently discards one. Reports, leaderboards, exports and counters read the same resolved value; a test asserts every presentation surface uses it. A correction can change a classification (e.g. excused vs unexcused). It can never turn unsupported, Unknown or incomplete evidence into a confirmed game event, and the UI does not offer that option.

### 4.3 Sync Transaction Boundaries and Locking

Each endpoint operation (one clan, one endpoint, one source scope) runs in its own explicit database transaction. Its data and its operation record (status, source IDs) commit together or neither commits.

**Operation lifecycle.** Each operation record moves through documented durable states: queued → running → (committed | failed | cancelled | interrupted), with an idempotency key (clan + endpoint + source scope + source identifiers) written before the API result is applied. On startup, running operations older than the stale-lock timeout are marked interrupted and become retryable. Retries reuse the idempotency key; where the API gives no stable source identity, a documented reconciliation procedure is used, never a guess. The state table lives in docs/schema.md with a test per transition. A failed or interrupted endpoint never erases or rolls back successful results from other endpoints or clans. A sync run is success only if every required endpoint succeeded; partial if any required endpoint failed, was skipped or incomplete. Each endpoint keeps its own status.

**Lock scope (recorded in docs/DECISIONS.md):** one lock per (clan, endpoint) pair, held by the sync service and backed by a durable operation record so it survives restarts (stale locks expire safely after a documented timeout; crash detected on startup). Different clans and endpoints may run concurrently up to the global limit. A second request for a locked scope waits or is refused with a clear message. Writes use short transactions because SQLite allows a single writer; document and test how this interacts with the lock model using concurrent syncs. User edits (corrections, notes, plan changes) use separate short transactions and never block or corrupt an in-flight operation. Canonical war identity is enforced by a database uniqueness constraint where identity is verified, so two concurrent syncs retrieving the same war through different clans cannot create two records; the loser of the race attaches a war_clan_view to the existing record.

**Lock staleness and crash recovery [v10].** docs/DECISIONS.md and docs/schema.md define: the stale-lock timeout value and its justification (longer than the request timeout times the maximum bounded retries, plus a margin); how a live running operation is distinguished from an abandoned one (the running process holds an in-memory handle plus a heartbeat timestamp on the durable operation record, updated at a documented interval; an operation with no in-memory handle in the current process, or a heartbeat older than the timeout, is abandoned); and what startup recovery does for a crash at each lifecycle point (before the idempotency key is written: nothing to recover; after the key is written but before the API response is applied: interrupted, retry; after the API response is received but before commit: the transaction rolled back, interrupted, retry fetches again and reuses the key; after commit but before the status update: impossible by construction, since data and status commit in one transaction). Each case has a test.

**Malformed and partial response outcome matrix [v10].** The endpoint operation's outcome is decided as follows, and docs/schema.md records it with a test per row:

| Situation | Data committed | Operation status | Run effect |
|---|---|---|---|
| Response fully valid | All records | committed | success for that endpoint |
| Not valid JSON, or required top-level fields missing | None | failed (error category: malformed) | run partial |
| Valid top-level, some individual records fail validation, and the endpoint's capability defines per-record validity as acceptable | Valid records only, in one transaction, with the rejected records counted and described in the operation record | committed with status partial and warnings | run partial |
| Valid top-level, some individual records invalid, and the capability does not allow partial acceptance | None | failed (malformed) | run partial |
| Parsing succeeded but database persistence fails | None (transaction rolled back) | failed (error category: persistence) | run partial |

The governing invariant: data and operation status always agree. There are never committed rows with a status saying the attempt did not happen, and never a success status for incomplete data. Which endpoints allow per-record partial acceptance is declared in the capability registry (12), defaulting to "no".

### 4.4 Historical Identity and Context

Historical war, CWL and raid events permanently retain the clan, season and event association that applied when observed. A player's current name, clan or membership never rewrites a historical event. Membership is stored as intervals. Rejoining opens a new interval; it never reopens or edits an old one. Rejoin links to the same player profile through the tag. (Canonical representation defined in 4.5.) "Same person" links connect account tags without merging them. Both identities are always preserved. Combined metrics deduplicate only where the metric's rule permits (5.10). Unlinking triggers a rebuild of every affected derived metric, and the audit trail records link and unlink. Group views (5.1) attribute each event to the clan it occurred in, not the player's current clan.

### 4.5 Record Classes and Identity Separation

Every table in docs/schema.md is classified as exactly one of:

(A) immutable source observation (API snapshots and normalized API observations); (B) manual input (manual entries, imports with manual provenance, manually entered membership events); (C) correction or reconciliation decision; (D) derived evaluation (calculations, including inferred membership transitions); (E) rebuildable cache or view; (T) temporary diagnostics (for example raw_api_debug): disposable, retention-limited, not rebuildable from A-D, never treated as evidence.

A table's class decides what may edit it: A is append-only; B and C are append-only with supersede/reverse records; D is append-only (new evaluations, never rewrites); E can be dropped and rebuilt from A-D at any time (a test rebuilds every cache and compares); T is pruned by its documented retention rule and by privacy deletion. The schema document also distinguishes tables from views and caches: for each table it records the single class, write permissions, retention policy and rebuild or deletion behaviour; for each view, its source tables and deterministic rebuild logic. An imported record is class B with manual-import provenance and is never represented as official API evidence.

Membership has one canonical representation. Snapshots are class A. Manually entered membership events are class B (append-only, separately identifiable). Inferred membership transitions (joined/left, derived from snapshot pairs) are class D: versioned interpretations that link the exact snapshots and the inference version. membership_intervals is a rebuildable view (E) derived from A, B and D; it is never independently edited. A manual membership fix is a class B record that the view rebuild consumes.

Identity is separated from event history (supports permanent delete). Shared historical events (war attacks, raid contributions, rosters, lineups, eligibility, ledger entries) reference an internal player_id, never the tag as their identity, and normalized historical tables do not duplicate the original tag. A single player_identity table maps player_id to the normalized tag. Permanent delete removes the tag mapping and replaces it with a stable placeholder (e.g. "Deleted player 0007"), so event rows and aggregates stay intact while the original tag is removed from the app's retained data. Same-person links, notes, excuses, profile observations and cached raw payloads referencing the player are removed or anonymized per 5.2. Corrections and audit records keep the placeholder. Exports and backups already made cannot be recalled (the UI says so).

**Privacy-erasure exception to immutability.** Immutability (class A, C, D append-only) never blocks the documented permanent-delete policy. Permanent delete is a narrowly scoped, audited privacy-erasure operation that may redact identity-bearing fields in otherwise immutable records (replacing them with the placeholder) and purges class T payloads. The exception is limited to identity-bearing fields; evidence values, timestamps and aggregates are untouched. Docs and UI describe this as logical deletion from the application's retained data: it does not and cannot guarantee forensic unrecoverability from old database pages, SSD storage, file-system snapshots or backups and exports already made, and the UI and docs say so.

---

## 5.10 Definitions and Calculation Rules

Missed attack, regular war. Each unused attack of a player in the lineup when the war ended. Two attacks with one used = one miss. Missed attack, CWL. The one unused attack on a day when the player was in that day's lineup. Benched players are never counted; players who joined after the war started are not counted. Missed attack, raid. See 5.6. Unknown, not a miss. If a sync happened too late to know who was eligible or how many attacks they had, store Unknown with a reason. A war first seen after it ended has Unknown eligibility unless captured or returned evidence supports it. Excused misses stay visible in raw totals, are flagged, and are excluded from reliability scores and miss penalties.

**Season (single source of truth).** Every record has a canonical season identifier, immutable once assigned (provisional until the deciding timestamp is known, 4.1). Regular war: season containing the war's end time. CWL: official CWL season identifier. Raid weekend: raid-season identifier with documented start and end. Membership events keep event and observation times and are not assigned to a war season. Automatic rollover is idempotent at the first sync after a new season. The manual "Start new season" action only creates a reporting boundary for future calculations; it never changes the season of existing wars or raids.

**Season calendar basis [v10].** Before Phase 3 implementation, docs/DECISIONS.md and docs/schema.md state the canonical season rule per record type: the time basis is always UTC; where the official API supplies a season identifier it is used verbatim; where only timestamps exist, the documented boundary (an explicit UTC instant per season, sourced from official documentation or Phase 0 captures and recorded with its source) decides the season, using a documented inclusive/exclusive rule at the boundary instant. The machine's local clock and time zone never participate. Boundary and DST tests run independently of the host time zone (tests execute under at least two different forced time-zone settings).

**Season versus reporting period, per metric.** docs/schema.md has a table stating for every metric and counter which it selects by: canonical season (war, CWL and raid counters, missed attacks, skipped clears), reporting period or date range (donations, activity, progression, improvement), or both. A reporting period selects records by canonical event time or observation interval (rule documented per metric) and never relabels the season of any record. An event spanning a period boundary follows the documented rule and is tested.

**CWL model.** Store the season roster (15 or 30 per clan) separately from each round's lineup; allow substitutions; roster membership is not participation. Each CWL season and round has a stable identifier. Each round has its own capture state, separate from content: not_attempted, captured, partial, failed, unavailable, not_recovered. A failed request never permanently marks a round missed; a retry updates state idempotently without duplicating attacks. Seven captured rounds is shown as seven only if each round's record is complete; partial rounds are shown as partial.

**Planner.** Separate hard constraints from preferences. Show why each player was suggested. Scoring uses a visible preset formula (adjustable weights optional). Warn on too few eligible players, duplicates and conflicting rules. Manual override is allowed and keeps the violation visible.

**Shifts.** Store planned, observed, cancelled, unresolved shifts and compare with the membership change at the next sync.

**Mirror hit.** Attacking the enemy base at the same map position as the attacker's rank. Mirror clear. That base ended at 100%, however many attacks. Show attack order only if the API provides it. Plans are versioned; a plan counts as followed only if the assigned target was hit; otherwise "hit by another member".

**Raid skipped clear.** A player is flagged when they attacked a district, left it below 100% and moved to another district while attacks remained. Not flagged: a player who clears, or whose final available attack leaves it uncleared. Count and list only offenders. If per-attack data and order are not exposed, show Unknown (or "possible", never "confirmed") or offer manual entry.

**Player identity.** The tag is the identity (internally via player_id, 4.5). A player seen in several tracked clans is one profile. A player in an untracked clan shows "not tracked / unknown". Stop tracking: Archive (default; keeps history, hides from active lists and leaderboards, toggle to include) or Permanent delete (5.2).

**Analytics formulas (single definition).**

Participation = confirmed eligible attacks used ÷ confirmed eligible attacks expected. Reliability = used ÷ (used + confirmed unexcused missed) × 100. Excused misses stay visible but are excluded; Unknown excluded from both sides and shown separately. Wherever a percentage is shown, also show numerator, denominator and the count of excluded or Unknown cases. Improvement = change between two chosen periods, minimum confirmed eligible attacks (default 10). Best donator = donations given in the chosen period from snapshot differences, handling season resets. For every snapshot counter (donations, trophies, XP, achievements) store raw observations and the reset/inference decision separately; a decrease is recorded as a decrease or reset, never silently converted into positive or negative activity. Ties: more eligible attacks, then player tag. Every calculation is reproducible, carries a formula version and the clan's active ruleset version (5.15). The formulas here are the default ruleset; a clan's rules may change classification but never evidence.

**Derivation provenance.** For every derived result the app can answer: (1) which source observations, (2) which corrections, (3) which clan ruleset and version, (4) which calculation implementation version, (5) whether confirmed, inferred, conflicting or unknown. Stored in rule_evaluations with an evaluation_inputs table (6); shown in the inspection view. Same evidence plus same versions always gives the same result. A change produces a new evaluation record; the previous evaluation is kept.

**Repeat missers.** No strike or warning system. The app shows lists, counters, excuse and note history; the leader decides. It never recommends or automates removal.

**Several accounts, one person.** Each account is its own player. Optional "same person" tags give a linked view with combined totals next to, never instead of, each account's stats. Account-level figures first; linked totals labelled account-combined; deduplicated only where event identity and metric semantics justify it. Follows 4.4.

**Access.** PC only, localhost. No phone or LAN mode, no login in v1.

**Display states.** Keep separate everywhere (tables, charts, filters, exports): 0 (established zero), Unknown, Unavailable, Incomplete, Not applicable, Stale. A missing value never silently becomes 0.

**Language and time.** English only. Times follow the PC's time zone by default, changeable in Settings; exports and chat messages use that zone. Internally UTC.

---

## 9. Security and Robustness

Bind to 127.0.0.1 by default. If the host is overridden, show a prominent warning in the UI and console. No LAN or remote access in v1. No telemetry. Validate all inputs. Parameterised queries only. Never log the API key; redact in error output. Clear errors for: invalid key, wrong IP, inaccessible resource, private war log, rate limit, clan not found, API maintenance (503). Do not assume every 403 is a wrong IP: verify the key with a harmless authenticated call and report separately whether authentication worked, the resource was inaccessible, or access was denied.

Backups use SQLite's online backup mechanism, never a raw copy of a live file. Backups carry no credentials: after the online backup, the stored credential (including the encrypted blob) is removed from the copy only, never the live database. Tests search the backup for a known test secret and its encrypted form. On restore the user re-enters the key and the UI says so. A test confirms the live credential still works after a backup is created. Identity data (player tags, names) inside backups follows the app-managed backup policy in 5.2, not this credential-stripping step — the two are independent and both tested.

**Restore sequence.** Restore validates the uploaded file (size, integrity check, schema version), shows its contents, and asks before replacing. The sequence is: (1) validate the uploaded backup; (2) run the migration dry run on a temporary copy; (3) stop accepting new operations and wait for or cancel in-flight ones; (4) quiesce and close all database connections (checkpoint the WAL); (5) preserve an automatic safety copy of the current database; (6) replace the database using a same-filesystem atomic rename where supported (never a copy over an open file); (7) reopen, verify integrity and schema, run migrations; (8) resume service. If any step fails, keep or restore the original database from the safety copy and report the actual failure. The server restarts or re-initializes its connections after replacement so no stale handle remains.

**Privacy audit test:** automated tests search logs, error responses, exports, diagnostic bundles and backups for a known test API key, and confirm no authorization header is ever logged.

**Migrations:** schema-version table; each migration atomic; auto-migrate only when safe and supported; back up before any destructive migration; clear message on failure; never silently drop a table or reset the database to get past an error; a failed migration never blocks restoring a backup. Tests: older database upgrades without losing history; migration failure leaves the database recoverable.

**Local server hardening:** request-size limits, strict handling of imported files and JSON, safe rendering of names and notes, no stack traces or filesystem paths in ordinary errors. The backend is never an open proxy. No telemetry, analytics, cloud database, external authentication or third-party AI service by default; any optional external connection is disclosed before enabling. Lifecycle: verify configuration and database before accepting requests, expose a health status, shut down cleanly, no duplicate background workers after a dev restart, no promise of background operation after the process exits.

### 9.1 Threat Model for the Local Web Server

Binding to 127.0.0.1 does not stop a malicious website in the user's browser from sending requests to the local server. Written into docs/security.md and tested against real routes:

Reject requests whose Host is not an expected loopback host and port, on every route (DNS rebinding). On every state-changing route (POST, PUT, PATCH, DELETE) require an allowed Origin or same-origin evidence and reject missing or foreign Origins. Do not rely on CORS alone: also require a per-session anti-CSRF token or custom header a cross-site form cannot send. Specifically protect: credential save, replace and test; sync start, cancel, retry; manual imports; corrections and deletions; backup download and restore upload; settings changes; demo/real mode switching. No route accepts a browser-supplied filesystem path. Uploads are streams or bounded buffers into a controlled temp location. No route lets the browser trigger an arbitrary outbound request. Outbound hosts: the official API and the explicit, user-clicked IP-lookup button after disclosure. Imported databases and JSON are validated (size, integrity, schema and version, strict Zod) before affecting active data and never executed or interpolated. Error responses, pages and diagnostic exports contain no credentials, stack traces or filesystem paths. Strict Content Security Policy; safe rendering (no raw HTML) of names, notes and imported text. Each control has an automated test sending a real request to the real route (foreign Origin, foreign Host, no CSRF token, oversized body, path parameter) and asserting rejection. Middleware existing does not satisfy the checklist.

**Origin handling for legitimate local use [v10].** The rule "reject missing or foreign Origin on state-changing routes" stays. docs/security.md records how legitimate local use fits it: the setup wizard and all UI calls come from the app's own page, whose browser requests carry a same-origin Origin (or Sec-Fetch-Site: same-origin evidence) plus the per-session CSRF token obtained from a safe GET; there is no documented scripted or curl workflow against state-changing routes in v1 (command-line users are not supported callers; if one is ever added it needs its own explicit, token-authenticated decision in docs/DECISIONS.md). The test matrix includes the legitimate path (same-origin plus token succeeds, including the first-run wizard before a key exists) alongside every rejection case, so the rule is proven not to break setup.

**Residual risk statement.** docs/security.md states that local encryption at rest does not protect against malware or another process running as the same OS user that can read both the database and the key file, and that ClashHQ is a single-user local tool.

**Build as small milestones.** Implement and verify in separate sub-steps: (1) Host check, (2) Origin and CSRF, (3) body-size and path rejection, (4) CSP and safe rendering, (5) upload/import validation, (6) error sanitization. Each sub-step ends with its own route-level tests before the next starts, so security is proven per control, not assumed from one large middleware.

### 9.2 Restore and Migration Failure Handling

A valid backup whose schema the current app cannot migrate is never applied destructively. The original database and the safety copy stay untouched until the uploaded file passes the integrity check and a migration dry run on a temporary copy succeeds. If migration fails, the active database stays as it was, the user sees a clear reason (schema too new, unsupported version, integrity failure) and a rollback or "keep current data" path. The safety copy is kept until the user confirms the restore worked. Tests: valid-but-unmigratable backup, schema newer than the app, interrupted restore, rollback to the safety copy, and restore performed while connections and WAL activity are live (not only on an idle database).

### 9.3 Credential Storage Map

Documented in docs/security.md with a test for each row:

| Item | Location |
|---|---|
| Plaintext key | In memory only, in the backend process, while in use; never on disk, never in logs |
| Encrypted key blob (AES-256-GCM, random nonce, auth tag) | settings table inside the SQLite database |
| Encryption key (random, auto-generated on first run) | Separate key file in the data folder, owner-only permissions where supported, written atomically, never inside SQLite |
| Backup artifact | Online-backup copy with the encrypted blob removed; no key file included by default (UI warns) |

Defined behaviour: key file missing, blob missing, blob corrupted (auth tag fails) or key file replaced with a different key each produce a clear "re-enter your API key" flow, never an unexplained failure or crash, and never leak partial secrets. A copy of the app on another PC, or a restored backup, takes the same flow. Tests cover each case.

**Credential design decision (single cross-platform design) [v10].** To prevent three improvised implementations, v1 uses one design on Windows, macOS and Linux, recorded in docs/security.md and docs/DECISIONS.md before Phase 1 implementation: (a) the encryption key is a random 256-bit key held in a local key file in the data folder — no OS keychain integration, no user passphrase, no derivation from machine identifiers in v1; (b) the key file contains a non-secret random key identifier (key_id) alongside the key, and the encrypted blob stores the key_id of the key that encrypted it; (c) "key file replaced with a different key" is detected by key_id mismatch between blob and key file (a clear, specific message), and independently by AES-GCM authentication-tag failure (corrupted blob or wrong key without a matching key_id); (d) every detected failure path (key file missing, blob missing, key_id mismatch, auth-tag failure) leads to the same re-enter flow, never a crash and never a partial-secret leak in the message; (e) owner-only file permissions are applied where the OS supports them (POSIX mode 0600; on Windows the documented best-effort ACL behaviour, with the limitation stated in docs/security.md rather than claimed away); (f) the only credential material that may ever appear in a backup is none — the encrypted blob and key_id reference are removed from the backup copy, and no key file is included. Any future change to this design (OS keychain, passphrase) is a new decision in docs/DECISIONS.md, not a change made while coding.

**User-facing statements.** The app and docs state plainly: a database backup does not include a usable credential; a restored database needs the API key re-entered; losing the key file also requires re-entry; and copying the entire data folder is not equivalent to a credential-free backup (it contains both the encrypted blob and the key file).

---

## 11. Engineering Invariants and Data Integrity

**Evidence model.** Every observation stores capture time, source (metric_method, evidence_source), related entity and sync run. Keep event time, observation time and inference time apart. Normalized event records are immutable (subject only to the privacy-erasure exception in 4.5). Counters are caches rebuildable from evidence. Every derived metric carries a calculation version. Corrections never silently overwrite history (4.1, 4.2, 4.5).

**Raw responses and retention.** Normalized events are permanent. Raw payloads live only in a short-lived debug table (class T; default retention 14 days, compressed, auto-pruned, Settings option to change retention or turn raw storage off, size limit). Permanent player deletion also purges cached raw payloads mentioning the player's tag (5.2 deletion cleanup procedure). Normalized history is kept until the user archives or deletes it. Demo mode uses a separate database file or instance; switching never migrates demo data into the real database and never changes the active database silently.

**Unknown, never zero.** Missing data is never read as zero, a miss, inactivity or success.

**War evidence is captured while the war runs.** Because syncing is manual, store the lineup and attack snapshot at every sync during preparation and war, and prompt the user to sync during wars. Handle players joining or leaving mid-war, removal, omitted attacks, the same war through several tracked clans, and wars that end early.

**Counter definitions.** Keep separate: eligible attacks, attacks used, unused attacks (only when both known), excused misses, unexcused misses, unknown attacks.

**Identity and membership.** The normalized tag is the identity (internal player_id, 4.5). Track membership per clan and, separately, whether a player is in any tracked clan; a transfer between tracked clans is not a departure. A planned change is not a confirmed change.

**CWL lifecycle.** Keep apart: proposed roster, confirmed in-game roster evidence, observed membership, and each round's lineup and participation. Plans are versioned with status (draft, approved, partially confirmed, completed); an approved plan is never overwritten silently. Fewer than 15 eligible players produces a draft labelled incomplete; it cannot be approved or valid until constraints pass or an explicit override is recorded. Reject a player in two rosters unless cross-roster use is allowed; warn about simultaneous commitments.

**Activity graph.** Store each observed change with its observation interval start and end. Show it on a single day only when evidence supports it; otherwise as an interval or via a documented approximation. Resets and decreases are never negative activity.

**Sync reliability.** Each run has an id and per-clan, per-endpoint results (attempt time, success time, outcome, error category, records processed, warnings). Bounded queue, shared rate-limit handling, backoff, timeouts. Never report full success when a required endpoint failed. Follows 4.3.

**Privacy and deletion.** Per 5.2 and 4.5 (logical deletion, the concrete cleanup procedure, app-managed backup policy, and disclosed limits).

**Legal.** Not affiliated with or endorsed by Supercell; disclaimer in the README and app. No game assets. Local-first, single-user, non-commercial; MIT does not override Supercell's Fan Content Policy; review it before any hosting or monetisation.

---

## 12. Capability Gates (Verify in Phase 0, Before Building)

Create a capability entry for each feature in docs/api-notes.md: endpoint, exact fields, current-only vs event-detail vs historical, availability window, recoverability after a missed sync, access limits, and status (supported, partially supported, manual entry only, unavailable, unverified). A failed check disables only that feature.

**Machine-readable registry.** docs/api-notes.md is the human record. Application code reads a validated, versioned registry (shared/capabilities.json or a typed module checked by Zod). Each capability has: ID, status, required fields, dependent features, verification evidence (doc reference, capture date, field-observed vs behaviour-verified, test ID), fallback behaviour (manual entry, Unknown or disabled), freshness threshold, and [v10] whether per-record partial acceptance is allowed (default no, see 4.3). Tests fail if: a feature depends on a capability with status unverified or unavailable without a declared safe fallback; a registry entry is missing a required property; or the registry and docs/api-notes.md disagree on status (check by capability ID).

**Registry source of truth [v10].** The registry file (shared/capabilities.json, validated by Zod) is canonical for status, fallback and thresholds. docs/api-notes.md is hand-maintained for narrative and evidence, but each capability's section must begin with one strict machine-checkable header line in a fixed format (for example `Capability: <ID> | Status: <status>`), and the consistency test parses only those header lines by capability ID, never free-form Markdown. A capability present in one place and not the other, a duplicate ID, or a status mismatch fails the test. The decision is recorded in docs/DECISIONS.md before Phase 1.

**Use of unverified capabilities [v10].** A capability with status unverified and a declared fallback (manual entry, Unknown or disabled) may be used only in its fallback mode; the feature shows that capability level in the UI (section 7). A capability that is unverified without a declared fallback blocks any dependent feature. The Phase 1 vertical slice may not rest on a capability that is merely unverified: it requires at least "field observed".

Fields below are hypotheses from third-party docs, to be confirmed against the official schema and real captures:

Clan Games points: no Clan Games endpoint exists. Verify the "Games Champion" achievement and its real behaviour (5.11). Default if unproven: manual entry with audit history. Raid eligibility: raid member records list attacks used, attack limit and bonus attack limit; district records list attacks. Verify the exact meaning of each limit field against official docs and real captures and record the expected-attacks formula including bonus attacks (5.6). Verify whether the order of one player's attacks across districts is exposed; if not, skipped clears are "possible" or Unknown, never confirmed, never guessed from final district result. Verify defense-log fields before showing raid defense data. War attack order: believed to include order, attacker, defender, stars, destruction and duration. Verify order; if absent, pre-cleared rule and watch flags show Unknown. Never invent per-attack timestamps. Hero equipment and active super troops: verify the fields; an ordinary troop record is never proof of an active super troop. War preference: verify whether and where it is returned. Retention and access: CWL and war details are available for a limited time; a private war log is inaccessible. "Unavailable" is a standard state for every endpoint. War availability levels: for war-log summary, detailed attacks, attack order and lineup, record what a finished war still returns and for how long. Endpoint freshness: record the recommended stale threshold per endpoint (5.14) with reasoning from the observed availability window.

**Feature versus capability.** The feature set stays as written. A feature remains in the specification even when implemented as manual-entry-only, partial, unavailable or disabled. A capability failure never justifies fabricated data, an invented field or an assumed value (especially attack order, historical war recovery, skipped raid clears, raid expected-attack limits and Clan Games scoring). The UI states which capability level each feature is running at and why.

---

## 13. Locked Decisions and Defaults

**Stack, fixed:** TypeScript; Node.js 24 LTS (pinned in .nvmrc, engines, Docker, CI); Fastify and Zod; better-sqlite3 and Drizzle ORM; React, Vite and Tailwind CSS; TanStack Table and Recharts; Vitest and Playwright. One root package.json with build, start, test, lint, typecheck and migrate scripts, a committed lockfile and reproducible CI installs. CI builds the native SQLite dependency on Windows, macOS and Linux; Playwright on one OS. Architecture: API client behind an interface so tests run on fixtures with no network. Game rules live in tested backend services, never UI components. Migrations are the only normal way to change the schema, created phase by phase. Entity relationships, unique constraints, deletion behaviour, indexes and retention are documented before feature screens. Clan Health, War Performance, Raid Analyzer and Progression Timeline are views over the same services. Release artifact: source repository plus a Docker image. No packaged binary in v1. Platforms: Windows, macOS and Linux are all v1 targets (reaffirmed in section 3); this is a locked decision, not an open question.

**Defaults (all configurable):** "few raid attacks" is fewer than 3; improvement minimum 10 confirmed eligible attacks; late-attack flag is the last 10% of attack orders (at least one); Clan Games minimum score off until member scores exist; season rollover automatic with manual reporting-boundary override; left players archived manually; CWL suggestions use a fixed documented preset; chat limit 250; raw payload retention 14 days; normalized history kept until archived or deleted.

**Scope:** feature set as written; the Later list (5.13) holds. Multi-user administration, network hosting, cloud sync, Discord posting, opponent scouting, upgrade timers and predictive analytics remain out of v1.

**Locked:** sync lock scope per (clan, endpoint); per-endpoint transactions with operation lifecycle; correction scope is entity + field + scope; membership canonical = snapshots (A) + manual events (B) + inferred transitions (D), intervals a rebuildable view (E); identity separated from event history via player_id; privacy erasure is logical deletion via the documented cleanup procedure, with disclosed limits and an app-managed backup flagging policy; credential storage per 9.3 (single cross-platform key-file design) [v10]; machine-readable capability registry, canonical in JSON [v10]; security checks tested on real routes; local-first workflow with Git only at approved phase checkpoints and release; checkpoint-copy triggers, exclusions and retention per 0.1; v10 is the frozen baseline.

---

## 15. Non-Negotiable Engineering and Data-Integrity Rules (Standing Rules for Every Session)

**Evidence and calculations.** Keep observations, manual entries, corrections and calculations separate. Never overwrite source evidence. Record observation time, source, entity and calculation or ruleset version. Never turn missing or unsupported data into zero. Never invent history, player movements, API fields or game events. Unknown, when honest, is a successful outcome. A correction is scoped, audited, reversible, reapplied on every recalculation and can never turn unsupported evidence into a confirmed event. Every table is classified A-E or T; caches are rebuildable.

**API capability.** Verify endpoints, fields, limits and rate limits before dependent features; use the capability registry; never claim the API can move players or confirm an in-game change. A capability failure downgrades the feature; it never justifies fabricated data.

**Synchronization.** Idempotent, retry-safe, crash-safe, concurrency-safe; separate last attempted, last successful, coverage and freshness; an absent record is not proof an event never happened. One transaction and one durable status per endpoint operation; per-(clan, endpoint) locks; a sync is partial if any required endpoint fails. Data and operation status always agree (4.3 matrix). [v10]

**Security and privacy.** Loopback by default; key only on the backend, stored per 9.3; no secrets in logs, exports, backups, diagnostics or git; sanitized errors; no telemetry or third-party services by default. Host, Origin and CSRF checks on every state-changing route, no browser-supplied paths, no arbitrary outbound requests, all tested on real routes. Raw captures stay outside the repository and are never shared with an AI session. Permanent deletion follows the documented cleanup procedure (5.2), not a single redaction write.

**Historical integrity.** Stable internal IDs (player_id); no merging uncertain records; history survives players leaving; versioned, tested migrations; explicit deletion, archive, retention and restore behaviour; reproducible calculations without double counting; history keeps its original clan, season and context; membership is intervals (a rebuildable view); reprocessing creates new interpretations; foreign keys enforced.

**Clan operations.** Planned, observed and confirmed stay separate; conflicts and unmet hard constraints are surfaced; a draft or approval is never presented as an in-game change; all formulas documented and tested; each clan's rules independent; rule precedence deterministic with an evidence floor; reports pinned to ruleset and calculation versions.

**Quality gates.** Unit, integration, migration, sync, security and end-to-end tests as appropriate; run tests, lint, typecheck and build before marking a phase complete; report real results; never start a dependent phase while a gate fails; not-yet-applicable gates marked as such; phase status separate from file and Git state and approved by the human.

**Discipline.** Follow the agreed architecture and scope; one active writer; work in the local folder; Git only at approved phase checkpoints and release, staging explicit paths after a secrets scan; justify every new dependency in docs/DECISIONS.md; keep UI free of API calls and game rules; update docs/PROGRESS.md every session; never commit secrets, databases, raw captures, backups or real player data; make a local checkpoint copy before any schema/migration change or multi-file change per the triggers in 0.1, excluding all sensitive material, and prune to the retention rule in 0.1. Write each phase's acceptance criteria and schema delta before implementing it, and keep the vertical-slice test as a permanent regression test. [v10]

**Acceptance.** A clean install works from the documented steps; every v1 feature has a status in docs/FEATURES.md and passes the release gate (10.1); unsupported information is disclosed in the UI; the app stays usable when the API is down.
