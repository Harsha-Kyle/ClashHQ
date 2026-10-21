# ClashHQ — API Notes and Capability Documentation

> This is the human-maintained narrative record for API capabilities.
> Source of truth for capability status is `shared/capabilities.json` (spec §12 [v10]).
>
> **Header format (machine-checkable, parsed by tests/registry-consistency.test.ts):**
> Each capability section MUST begin with exactly:
> `Capability: <id> | Status: <status>`
> where `<id>` matches the `id` field in `shared/capabilities.json` and `<status>` matches
> the `status` field exactly (one of: supported, field_observed, partial, manual_entry, unavailable, unverified).
>
> A missing header, duplicate ID, or status mismatch **fails the consistency test**.
> Update both this file and `shared/capabilities.json` together.

---

## Phase 0 Questions Answered from Real Captures

Per CLASHHQ_SPEC.md §10 and §12, Phase 0 answers to the core capability questions based on verified captures (captured 2026-10-21):

1. **War attacks + order: YES.**
   - Verified from `GET /clans/{clanTag}/currentwar` (`current-war.json`).
   - The response includes detailed member attacks with fields: `order` (integer, e.g. 40), `attackerTag`, `defenderTag`, `stars`, `destructionPercentage`, and `duration`.
   - Both `attacksPerMember` (e.g. 2) and `teamSize` (e.g. 40) are explicitly returned.
   - Attack order is present, which allows mirror pre-clear waivers and watch flag calculations when active wars are captured.

2. **Eligibility: YES (with caveats for timing).**
   - Verified from `currentwar` (`clan.members[]` array) and `capitalraidseasons` (`members[]` array).
   - In war, `clan.members[]` returns the exact lineup of players selected for the war, including map positions.
   - Per spec §5.3, a member-list snapshot alone does not establish war eligibility (members can be benched or join mid-war). Eligibility requires the active war lineup.
   - If a war is only observed after it ended via `warlog`, member-level lineup and attacks are NOT returned (warlog provides only summary statistics). In that case, eligibility is explicitly `Unknown`.

3. **Raid limits & skipped clears: PARTIAL.**
   - Verified from `GET /clans/{clanTag}/capitalraidseasons` (`raid-seasons.json`).
   - Raid member records explicitly contain: `attacks`, `attackLimit` (e.g. 5), `bonusAttackLimit` (e.g. 1), and `capitalResourcesLooted`.
   - The expected attacks formula is verified: `attackLimit + bonusAttackLimit` (total 6 when bonus attack earned, 5 otherwise).
   - **Skipped clears:** District records contain `attacks[]` lists with `attacker.tag` and `destructionPercent`. However, attacks across different districts do **not** expose a global sequence/order field linking a member's progression across districts.
   - Consequence (spec §5.10): Skipped clears cannot be definitively "confirmed" from API data alone; they remain marked as "possible" or `Unknown`. `raid-attack-order` remains `unverified`.

4. **CWL rounds: UNVERIFIED (Off-season).**
   - `GET /clans/{clanTag}/currentwar/leaguegroup` returned HTTP 404.
   - Consistent with Supercell API documentation: league group endpoints are unavailable outside the active CWL tournament week.
   - `cwl-league-group` and `cwl-war` remain `unverified`.

5. **Unavailability vs. uncaptured: YES.**
   - Inaccessible/private resources return explicit HTTP status codes (HTTP 403 for private war log, HTTP 404 for off-season CWL, HTTP 200 with `state: "notInWar"` for clans not in war).
   - Uncaptured data (e.g., missed syncs or wars first seen after ending) can be distinguished by the absence of an operation record for that capture window and absence of lineup details. Missing data is stored as `Unknown` with a stated reason, never recorded as zero.

---

## Rate Limits and Defaults

> To be filled from real API responses and official documentation during Phase 0.
> All values below are hypotheses; none are verified.

- Request concurrency limit: unknown — to be verified from official docs and rate-limit headers observed in captures.
- Rate-limit headers: unknown — check for X-RateLimit-*, Retry-After.
- Recommended stale thresholds per endpoint: see individual capability entries below.
- Timeout and retry defaults: to be recorded in this file after Phase 0, justified from observed behaviour.

---

## Tag Normalisation Rules

Tags must be normalised before use:
1. Uppercase all letters.
2. Replace leading letter O with digit 0 (and any embedded O→0 per spec §4).
3. Ensure leading `#`.
4. URL-encode `#` as `%23` in request paths.

Validation regex (to be confirmed against real captures): `^#[0289PYLQGRJCUV]{3,9}$`

---

## Capabilities

---

### Clan Info

Capability: clan-info | Status: field_observed

**Endpoint:** `GET /clans/{clanTag}`
**Questions:** Establishes baseline for all clan tracking.
**Official doc:** https://developer.clashofclans.com/api-docs/index.html — /clans/{clanTag}

**Fields observed in capture (2026-10-21):**
- `tag`, `name`, `type`, `description`, `location`
- `badgeUrls` (sanitized to placeholders)
- `clanLevel`, `clanPoints`, `clanBuilderBasePoints`, `clanCapitalPoints`
- `capitalLeague`, `warLeague`, `warFrequency`, `warWinStreak`, `warWins`, `warTies`, `warLosses`, `isWarLogPublic`
- `members` (count: 50)
- `memberList` (array of 50 members)
- `labels`, `chatLanguage`, `clanCapital` (capitalHallLevel, districts array)

**Availability:** Current state only. No historical record.

**Verification notes:** Field presence observed in `fixtures/clan-info.json`. Behaviour over time (e.g. member departure diffs) is verified across multiple syncs in Phase 2.

**Freshness threshold:** 60 minutes (configurable in Settings).

**Fallback:** disabled — clan cannot be tracked without this endpoint.

---

### Clan Members

Capability: clan-members | Status: field_observed

**Endpoint:** `GET /clans/{clanTag}/members`
**Questions:** Answers eligibility (member presence), join/leave inference, Phase 1 vertical slice.
**Official doc:** https://developer.clashofclans.com/api-docs/index.html — /clans/{clanTag}/members

**Fields observed in capture (2026-10-21):**
- `items[]` array containing 50 member objects
- Each member has: `tag`, `name`, `role`, `townHallLevel`, `expLevel`, `league`, `trophies`, `versusTrophies`, `clanRank`, `previousClanRank`, `donations`, `donationsReceived`

**Availability:** Current state only. Join/leave events are NOT provided by the API;
they exist only as differences between consecutive successful member-list snapshots.

**Recoverability:** None — a player who joins and leaves between two syncs may never be observed (spec §4.1).

**Partial acceptance:** Allowed — individual member records failing Zod validation may be
stored as partial if the top-level list is valid JSON. The rejected-record count is stored
in the operation record.

**Verification notes:** Field presence confirmed in `fixtures/clan-members.json`. All 50 members correspond 1:1 with `clan-info.json.memberList`. **Phase 1 vertical slice requirement met: capability is at least field_observed (spec §12).**

**Freshness threshold:** 60 minutes.

**Fallback:** disabled — member tracking is impossible without this endpoint.

---

### Current War

Capability: current-war | Status: field_observed

**Endpoint:** `GET /clans/{clanTag}/currentwar`
**Questions:** Answers Q1 (war attacks and attack order), Q2 (eligibility from lineup).
**Official doc:** https://developer.clashofclans.com/api-docs/index.html — /clans/{clanTag}/currentwar

**Fields observed in capture (2026-10-21):**
- `state`: `"inWar"`
- `teamSize`: 40
- `attacksPerMember`: 2
- `battleModifier`: `"none"`
- `preparationStartTime`, `startTime`, `endTime` (UTC ISO format)
- `clan` and `opponent`: each containing `tag`, `name`, `badgeUrls`, `clanLevel`, `attacks`, `stars`, `destructionPercentage`, and `members[]`
- Member records include: `tag`, `name`, `townHallLevel`, `mapPosition`, `attacks[]`, `opponentAttacks`, `bestOpponentAttack`

**Availability:** Active during preparation and war. May be briefly available after warEnded.
Exact retention after warEnded is unverified — this is a Phase 0 question.

**Recoverability:** Attack detail and attack order may not be recoverable after the war ends
if not captured while active. War summary may remain available in the war log.

**Verification notes:** Verified in `fixtures/current-war.json`.

**Freshness threshold:** 30 minutes (high urgency during active war).

**Fallback:** partial — war summary from war log if currentwar was not captured; attack detail shows Unknown.

---

### War Attack Order

Capability: war-attack-order | Status: field_observed

**Endpoint:** `GET /clans/{clanTag}/currentwar` (field: `attacks[].order`)
**Questions:** Answers Q1 — specifically whether attack order is included in the API response.
**Official doc:** Same as current-war.

**Fields observed in capture (2026-10-21):**
- Attack objects inside `clan.members[].attacks[]` explicitly contain integer `order` (e.g. `order: 40`), alongside `attackerTag`, `defenderTag`, `stars`, `destructionPercentage`, and `duration`.

**Critical rule (spec §§5.10, 12):**
- `order` is present and observed. Pre-cleared mirror waiver and watch flag can be calculated for captured active wars.
- If a war is only captured via `warlog`, attack order is absent and both features must show **Unknown**.

**Verification notes:** Field presence verified in `fixtures/current-war.json`.

**Fallback:** unknown — mirror pre-clear and watch flag show Unknown without attack order.

---

### War Log

Capability: war-log | Status: field_observed

**Endpoint:** `GET /clans/{clanTag}/warlog`
**Questions:** Answers Q5 — how to distinguish unavailable (private war log) from uncaptured.
**Official doc:** https://developer.clashofclans.com/api-docs/index.html — /clans/{clanTag}/warlog

**Fields observed in capture (2026-10-21):**
- `items[]` array containing 60 historical war summaries.
- Each item contains: `result` (e.g. `"win"`), `endTime`, `teamSize`, `attacksPerMember`, `battleModifier`, `clan`, `opponent`.
- Clan and opponent summaries contain `tag`, `name`, `badgeUrls`, `clanLevel`, `attacks`, `stars`, `destructionPercentage`, `expEarned`.
- Member arrays and individual attack records are **not** present in the war log.

**Known limitation:** A private war log returns HTTP 403. The app must show "war log is private"
clearly, not treat it as an error or network failure.

**Availability:** War log entries do not include detailed attack records. Detailed attacks require
capturing the currentwar endpoint while the war is active.

**Partial acceptance:** Allowed — individual war log entries failing validation may be skipped
with a warning; overall operation status becomes partial.

**Freshness threshold:** 1440 minutes (24 hours).

**Fallback:** partial — war log summary available if not private; attack detail requires active-war capture.

---

### CWL League Group

Capability: cwl-league-group | Status: unverified

**Endpoint:** `GET /clans/{clanTag}/currentwar/leaguegroup`
**Questions:** Answers Q4 — whether all seven CWL rounds can be captured.
**Official doc:** https://developer.clashofclans.com/api-docs/index.html — /clans/{clanTag}/currentwar/leaguegroup

**Fields of interest (hypotheses):**
- `season` — CWL season identifier (used verbatim as canonical season ID per spec §5.10)
- `clans[]` — participating clans with members
- `rounds[]` — list of round war tags (each used to fetch the individual CWL war)

**Availability:** Only available during active CWL season. Returns HTTP 404 outside CWL. The
spec requires a "sync every round" prominent banner during CWL (spec §4.1).

**Per-round capture:** Each round's war tag is fetched separately via the cwl-war capability.
Round detail may expire after the CWL season ends (exact window unverified).

**Freshness threshold:** 60 minutes during CWL season.

**Fallback:** unknown — show "no active CWL season" outside season; missed rounds labelled "not captured".

---

### CWL War

Capability: cwl-war | Status: unverified

**Endpoint:** `GET /clanwarleagues/wars/{warTag}`
**Questions:** Answers Q4 — attack detail per CWL round.
**Official doc:** https://developer.clashofclans.com/api-docs/index.html — /clanwarleagues/wars/{warTag}

**Fields of interest (hypotheses):**
- `state`, `startTime`, `endTime`
- `clan`, `opponent` — with members and attacks
- `warTag` — used as canonical CWL war identity (spec §5.3)

**Availability:** Round detail has a limited retention window after the CWL season ends.
Exact window is unverified — this is a key Phase 0 question.

**Freshness threshold:** 60 minutes during active round.

**Fallback:** partial — rounds not captured within the availability window show "not captured"
(capture state: not_recovered), never "failed".

---

### Raid Seasons

Capability: raid-seasons | Status: field_observed

**Endpoint:** `GET /clans/{clanTag}/capitalraidseasons`
**Questions:** Answers Q3 — raid eligibility, attack limits, skipped clears.
**Official doc:** https://developer.clashofclans.com/api-docs/index.html — /clans/{clanTag}/capitalraidseasons

**Fields observed in capture (2026-10-21):**
- `items[]` array containing 20 raid seasons.
- Each season has: `state` (`"ended"`), `startTime`, `endTime`, `capitalTotalLoot`, `raidsCompleted`, `totalAttacks`, `enemyDistrictsDestroyed`, `offensiveReward`, `defensiveReward`.
- `members[]` array listing participating members with: `tag`, `name`, `attacks`, `attackLimit`, `bonusAttackLimit`, `capitalResourcesLooted`.
- `attackLog[]` array with defender clan details and destroyed districts.
- District objects contain: `id`, `name`, `districtHallLevel`, `destructionPercent`, `stars`, `attackCount`, `totalLooted`, `attacks[]`.
- `defenseLog[]` array with attacking clans and defended districts.

**Partial acceptance:** Allowed — individual season entries failing validation may be skipped.

**Freshness threshold:** 1440 minutes (24 hours); more frequent during active raid weekend.

**Fallback:** unknown — missing data shows Unknown with reason. Never infer from clan-level totals.

---

### Raid Attack Limit Fields

Capability: raid-attack-limit-fields | Status: field_observed

**Endpoint:** `GET /clans/{clanTag}/capitalraidseasons`
  (fields: `members[].attackLimit`, `members[].bonusAttackLimit`)
**Questions:** Answers Q3 — critical for raid eligibility and expected-attacks formula.
**Official doc:** Same as raid-seasons.

**Fields observed in capture (2026-10-21):**
- `members[].attacks` (attacks used)
- `members[].attackLimit` (base attack limit, observed: 5)
- `members[].bonusAttackLimit` (bonus attack limit, observed: 1)
- Verified formula: `expected attacks = attackLimit + bonusAttackLimit` (6 if bonus attack unlocked, 5 otherwise).

**Critical rule (spec §§5.6, 12):**
- Fields are observed and verified. The expected-attacks formula is grounded directly in API evidence.

**Verification notes:** Verified in `fixtures/raid-seasons.json`.

**Fallback:** unknown — expected attacks shows Unknown if fields absent or contradictory.

---

### Raid Attack Order

Capability: raid-attack-order | Status: unverified

**Endpoint:** `GET /clans/{clanTag}/capitalraidseasons`
  (field: attack order across districts, if exposed)
**Questions:** Answers Q3 — determines whether skipped clears can be confirmed vs "possible".
**Official doc:** Same as raid-seasons.

**Hypothesis:** Per-member attacks across districts may or may not include a sequence/order field.
This determines whether a player "skipped" a clear (attacked a district, left it below 100%,
moved to another district while attacks remained).

**Critical rule (spec §§5.10, 12):**
- If order field is exposed and verified: skipped clear can be confirmed.
- If absent: skipped clear state is "possible" or Unknown. **Never confirm from district final state alone.**

**Fallback:** unknown — skipped clears show "possible" or Unknown; never "confirmed" without order evidence.

---

### Player Profile

Capability: player-profile | Status: unverified

**Endpoint:** `GET /players/{playerTag}`
**Questions:** General player data; baseline for progression timeline.
**Official doc:** https://developer.clashofclans.com/api-docs/index.html — /players/{playerTag}

**Fields of interest (hypotheses):**
- `tag`, `name`, `expLevel`, `trophies`, `versusTrophies`, `bestTrophies`
- `warStars`, `attackWins`, `defenseWins`
- `clan`, `role`, `league`, `donations`, `donationsReceived`
- `achievements[]` — cumulative counters (Games Champion lives here)
- `troops[]`, `heroes[]`, `heroEquipment[]`, `spells[]`

**Availability:** Current state only. Progression timeline built from repeated snapshot diffs.

**Partial acceptance:** Allowed — missing optional fields produce Unknown in the UI.

**Freshness threshold:** 1440 minutes (24 hours).

**Fallback:** partial — missing optional fields degrade gracefully to Unknown display.

---

### Hero Equipment

Capability: hero-equipment | Status: unverified

**Endpoint:** `GET /players/{playerTag}` (field: `heroEquipment`)
**Questions:** Verify field name and structure in the official schema.
**Official doc:** Same as player-profile.

**Critical rule (spec §12):**
An ordinary troop record is **never** proof of an active super troop.

**Fallback:** disabled — hero equipment display disabled if field absent from official schema.

---

### Super Troops

Capability: super-troops | Status: unverified

**Endpoint:** `GET /players/{playerTag}` (field: active-super-troop indicator)
**Questions:** Whether a distinct field marks a troop as actively boosted (not just present).
**Official doc:** Same as player-profile.

**Critical rule (spec §§5.11, 12):**
An ordinary troop record is never proof of an active super troop. Super troop display is enabled
only if a distinct verified active-super-troop field exists in the official schema.

**Fallback:** disabled — feature disabled if no distinct active field is verified.

---

### War Preference

Capability: war-preference | Status: unverified

**Endpoint:** `GET /players/{playerTag}` (field: `warPreference` or equivalent)
**Questions:** Whether war opt-in/opt-out status is returned.
**Official doc:** Same as player-profile.

**Hypothesis:** A `warPreference` field (in | out) may be present. Verify field name and values
against real captures.

**Fallback:** disabled — feature disabled if field absent. Shown only if verified in Phase 0,
with its observation time.

---

### Clan Games Achievement

Capability: clan-games-achievement | Status: unverified

**Endpoint:** `GET /players/{playerTag}` (achievement: `Games Champion`)
**Questions:** Answers whether Clan Games scoring can be derived automatically.
**Official doc:** Same as player-profile.

**Context (spec §5.11):** No Clan Games endpoint exists in the official API. Other tools diff
the "Games Champion" achievement counter between start and end snapshots. This is acceptable
only if Phase 0 demonstrates the counter increases as expected, including:
- Per-player cap behaviour.
- Completed-achievement behaviour (counter may stop increasing or cap out).
- Consistent per-event increment.

**Default if unproven:** Manual entry with audit history. Automatic derivation disabled.

**Fallback:** manual_entry — event, player, score, source, timestamp, audit history.

---

### Player Tag Lookup

Capability: player-tag-lookup | Status: unverified

**Endpoint:** `GET /players/{playerTag}`
**Questions:** Verify how the API handles malformed tags (normalisation vs rejection).
**Official doc:** https://developer.clashofclans.com/api-docs/index.html

**Normalisation rules (spec §4):**
1. Uppercase all letters.
2. Replace letter O with digit 0.
3. Ensure leading `#`.
4. URL-encode `#` as `%23`.

The app normalises tags before sending them. Verify in Phase 0 whether the API normalises
internally or rejects malformed inputs, and what error code is returned for an invalid tag.

**Fallback:** partial — normalisation handled in app; API response behaviour documented here.

---

## Gaps and Questions Not Yet Answered

The following questions from spec §10 and §12 remain open until the human runs the capture script:

| Question | Capability ID | Current Status |
|---|---|---|
| War attack order field present? | war-attack-order | unverified |
| Raid attack-limit field names and semantics | raid-attack-limit-fields | unverified |
| Raid attack order across districts | raid-attack-order | unverified |
| Hero equipment field structure | hero-equipment | unverified |
| Super-troop active indicator | super-troops | unverified |
| War preference field | war-preference | unverified |
| Games Champion achievement behaviour | clan-games-achievement | unverified |
| War log availability and retention window | war-log | unverified |
| CWL round detail expiry window | cwl-war | unverified |
| currentwar retention after warEnded | current-war | unverified |
| Rate-limit headers and retry behaviour | all | unverified |
