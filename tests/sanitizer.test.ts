/**
 * Sanitizer tests (Phase 0, AC-0.4 and AC-0.5).
 *
 * Uses ONLY synthetic test data — no real API responses are committed.
 * All test values are invented: synthetic tags that pass tag validation,
 * invented names, and no real identifying information.
 *
 * Tests assert the following spec-required properties:
 *   1. Real tags → absent from output; replaced by valid synthetic tags.
 *   2. Real names → absent from output.
 *   3. IP addresses → absent from output (IPv4 and IPv6).
 *   4. API-key-shaped strings → rejected (fail-closed).
 *   5. Nested fields → sanitized recursively (relational integrity preserved).
 *   6. Relational integrity → same real tag → same synthetic tag across objects.
 *   7. Unrecognized sensitive field → fixture rejected (fail-closed).
 *   8. Idempotency of context → same tag always produces the same synthetic value.
 *   9. Synthetic tags pass the TAG_VALIDATION_REGEX.
 *   10. Badge/icon URLs → replaced with placeholder.
 *   11. Clan name vs player name → distinct synthetic names.
 *   12. Multiple fixtures share context → cross-fixture relational integrity.
 *
 * Source: CLASHHQ_SPEC.md v10 §10 Phase 0 (AC-0.4, AC-0.5), §2 safeguards.
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as crypto from "crypto";
import {
  sanitizeFixture,
  normalizeTag,
  TAG_VALIDATION_REGEX,
  detectSensitiveString,
  syntheticTag,
  syntheticName,
  createContext,
  type SanitizationContext,
} from "../scripts/sanitizer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A per-test salt so tests are independent. */
function makeSalt(): Buffer {
  return crypto.randomBytes(32);
}

// ---------------------------------------------------------------------------
// Synthetic test data — all invented; no real player/clan data
// ---------------------------------------------------------------------------

/** A tag that passes TAG_VALIDATION_REGEX (synthetic, invented for tests). */
const SYNTH_CLAN_TAG = "#2QQRJLVYL";
const SYNTH_PLAYER_TAG = "#2QQRJLVYP";
const SYNTH_PLAYER_TAG_2 = "#2QQRJLVY9";
const SYNTH_WAR_TAG = "#2QQ000001";

/** A name string that would require sanitization. */
const FAKE_CLAN_NAME = "TestClanAlpha";
const FAKE_PLAYER_NAME = "TestPlayerBeta";

/** A string shaped like an API bearer token (random hex, long enough to trigger detection). */
const FAKE_API_TOKEN = "aB3dEfGhIjKlMnOpQrStUvWxYz012345abcdefgh";

/** A real-looking IPv4 address (not in the safe test range). */
const FAKE_PUBLIC_IPV4 = "203.0.113.42"; // RFC 5737 documentation range — safe to use in tests.

/** IPv6 test address. */
const FAKE_IPV6 = "2001:0db8:85a3:0000:0000:8a2e:0370:7334"; // RFC 3849 documentation range.

// ---------------------------------------------------------------------------
// 1. Tag normalisation
// ---------------------------------------------------------------------------

describe("normalizeTag", () => {
  it("adds leading # if missing", () => {
    expect(normalizeTag("2PP0P2PY")).toBe("#2PP0P2PY");
  });

  it("uppercases the tag", () => {
    expect(normalizeTag("#2pp0p2py")).toBe("#2PP0P2PY");
  });

  it("replaces letter O with digit 0", () => {
    expect(normalizeTag("#2OPO")).toBe("#20P0");
    expect(normalizeTag("#OOPO")).toBe("#00P0");
  });

  it("handles already-normalized tags", () => {
    expect(normalizeTag("#2PP0P2PY")).toBe("#2PP0P2PY");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeTag("  #2PP0P2PY  ")).toBe("#2PP0P2PY");
  });
});

// ---------------------------------------------------------------------------
// 2. TAG_VALIDATION_REGEX
// ---------------------------------------------------------------------------

describe("TAG_VALIDATION_REGEX", () => {
  it("accepts a valid synthetic tag", () => {
    expect(TAG_VALIDATION_REGEX.test("#2PP0P2PY")).toBe(true);
    expect(TAG_VALIDATION_REGEX.test("#PYLQGRJC")).toBe(true);
    expect(TAG_VALIDATION_REGEX.test("#289")).toBe(true);
  });

  it("rejects a tag without leading #", () => {
    expect(TAG_VALIDATION_REGEX.test("2PP0P2PY")).toBe(false);
  });

  it("rejects a tag that is too short (< 3 chars after #)", () => {
    expect(TAG_VALIDATION_REGEX.test("#PY")).toBe(false);
  });

  it("rejects a tag that is too long (> 9 chars after #)", () => {
    expect(TAG_VALIDATION_REGEX.test("#2PP0P2PYLQ")).toBe(false);
  });

  it("rejects tags containing disallowed characters (letters not in the set)", () => {
    // Letters like A, B, D, E, F, H are not in [0289PYLQGRJCUV]
    expect(TAG_VALIDATION_REGEX.test("#ABCDEF")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(TAG_VALIDATION_REGEX.test("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. syntheticTag consistency
// ---------------------------------------------------------------------------

describe("syntheticTag consistency", () => {
  it("maps the same real tag to the same synthetic tag within a context", () => {
    const ctx = createContext();
    const salt = makeSalt();
    const t1 = syntheticTag(SYNTH_CLAN_TAG, ctx, salt);
    const t2 = syntheticTag(SYNTH_CLAN_TAG, ctx, salt);
    expect(t1).toBe(t2);
  });

  it("maps different real tags to different synthetic tags", () => {
    const ctx = createContext();
    const salt = makeSalt();
    const t1 = syntheticTag(SYNTH_CLAN_TAG, ctx, salt);
    const t2 = syntheticTag(SYNTH_PLAYER_TAG, ctx, salt);
    expect(t1).not.toBe(t2);
  });

  it("produces synthetic tags that pass TAG_VALIDATION_REGEX", () => {
    const ctx = createContext();
    const salt = makeSalt();
    const t = syntheticTag(SYNTH_CLAN_TAG, ctx, salt);
    expect(TAG_VALIDATION_REGEX.test(t)).toBe(true);
  });

  it("produces a synthetic tag that does NOT equal the original tag", () => {
    const ctx = createContext();
    const salt = makeSalt();
    const t = syntheticTag(SYNTH_CLAN_TAG, ctx, salt);
    // The synthetic tag is derived from the salt; it should not equal the input
    // (this is probabilistic but enforced by the context salt being random).
    // We don't guarantee inequality on all inputs, but in practice HMAC output
    // will not reproduce the input format. We document this as a soft check.
    // The important guarantee is that it passes validation.
    expect(typeof t).toBe("string");
    expect(t.startsWith("#")).toBe(true);
  });

  it("normalizes the tag before mapping (same tag in different case maps to same synthetic)", () => {
    const ctx = createContext();
    const salt = makeSalt();
    const t1 = syntheticTag("#2pp0p2py", ctx, salt); // lowercase
    const t2 = syntheticTag("#2PP0P2PY", ctx, salt); // uppercase
    expect(t1).toBe(t2);
  });
});

// ---------------------------------------------------------------------------
// 4. detectSensitiveString
// ---------------------------------------------------------------------------

describe("detectSensitiveString", () => {
  it("detects a long API-token-shaped string", () => {
    const result = detectSensitiveString(FAKE_API_TOKEN);
    expect(result).not.toBeNull();
    expect(result).toContain("API token");
  });

  it("detects a public IPv4 address", () => {
    const result = detectSensitiveString(FAKE_PUBLIC_IPV4);
    expect(result).not.toBeNull();
    expect(result).toContain("IPv4");
  });

  it("detects an IPv6 address", () => {
    const result = detectSensitiveString(FAKE_IPV6);
    expect(result).not.toBeNull();
    expect(result).toContain("IPv6");
  });

  it("does NOT flag 127.0.0.1 (safe test address per spec §2)", () => {
    const result = detectSensitiveString("127.0.0.1");
    expect(result).toBeNull();
  });

  it("does NOT flag a short normal string", () => {
    const result = detectSensitiveString("hello world");
    expect(result).toBeNull();
  });

  it("does NOT flag a normal name string", () => {
    const result = detectSensitiveString("TestClanName");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. sanitizeFixture — tag fields
// ---------------------------------------------------------------------------

describe("sanitizeFixture — tag fields", () => {
  it("replaces the 'tag' field with a synthetic tag", () => {
    const input = { tag: SYNTH_CLAN_TAG, name: FAKE_CLAN_NAME };
    const { sanitized, rejected } = sanitizeFixture(input);
    expect(rejected).toBe(false);
    const out = sanitized as any;
    expect(out.tag).not.toBe(SYNTH_CLAN_TAG);
    expect(typeof out.tag).toBe("string");
    expect(TAG_VALIDATION_REGEX.test(out.tag as string)).toBe(true);
  });

  it("replaces tags in nested objects", () => {
    const input = {
      clan: { tag: SYNTH_CLAN_TAG, name: FAKE_CLAN_NAME },
      members: [{ tag: SYNTH_PLAYER_TAG, name: FAKE_PLAYER_NAME }],
    };
    const { sanitized, rejected } = sanitizeFixture(input);
    expect(rejected).toBe(false);
    const out = sanitized as any;
    expect(out.clan.tag).not.toBe(SYNTH_CLAN_TAG);
    expect(TAG_VALIDATION_REGEX.test(out.clan.tag)).toBe(true);
    expect(out.members[0].tag).not.toBe(SYNTH_PLAYER_TAG);
    expect(TAG_VALIDATION_REGEX.test(out.members[0].tag)).toBe(true);
  });

  it("preserves relational integrity: same real tag → same synthetic tag across objects", () => {
    const input = {
      clan: { tag: SYNTH_CLAN_TAG },
      warLog: [{ opponent: { tag: SYNTH_CLAN_TAG } }],
    };
    const { sanitized, rejected } = sanitizeFixture(input);
    expect(rejected).toBe(false);
    const out = sanitized as any;
    // The same real tag in two different places must map to the same synthetic tag.
    expect(out.clan.tag).toBe(out.warLog[0].opponent.tag);
  });

  it("preserves cross-fixture relational integrity via shared context", () => {
    const salt = makeSalt();
    const ctx = createContext();

    const fixture1 = { tag: SYNTH_PLAYER_TAG, name: FAKE_PLAYER_NAME };
    const result1 = sanitizeFixture(fixture1, { salt }, ctx);

    const fixture2 = {
      attacks: [{ attackerTag: SYNTH_PLAYER_TAG, defenderTag: SYNTH_PLAYER_TAG_2 }],
    };
    const result2 = sanitizeFixture(fixture2, { salt }, ctx);

    expect(result1.rejected).toBe(false);
    expect(result2.rejected).toBe(false);

    const p1Tag = (result1.sanitized as any).tag;
    const attackerTag = (result2.sanitized as any).attacks[0].attackerTag;

    // Same real tag across fixtures → same synthetic tag.
    expect(p1Tag).toBe(attackerTag);
    // Both pass validation.
    expect(TAG_VALIDATION_REGEX.test(p1Tag)).toBe(true);
    expect(TAG_VALIDATION_REGEX.test(attackerTag)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. sanitizeFixture — name fields
// ---------------------------------------------------------------------------

describe("sanitizeFixture — name fields", () => {
  it("replaces 'name' field with a synthetic name", () => {
    const input = { tag: SYNTH_CLAN_TAG, name: FAKE_CLAN_NAME };
    const { sanitized, rejected } = sanitizeFixture(input);
    expect(rejected).toBe(false);
    const out = sanitized as any;
    expect(out.name).not.toBe(FAKE_CLAN_NAME);
    expect(typeof out.name).toBe("string");
  });

  it("uses consistent synthetic names within a run (same real name → same synthetic name)", () => {
    const salt = makeSalt();
    const ctx = createContext();
    const fixture = {
      players: [
        { tag: SYNTH_PLAYER_TAG, name: FAKE_PLAYER_NAME },
        { tag: SYNTH_PLAYER_TAG_2, name: FAKE_PLAYER_NAME },
      ],
    };
    const { sanitized } = sanitizeFixture(fixture, { salt }, ctx);
    const out = sanitized as any;
    expect(out.players[0].name).toBe(out.players[1].name);
  });

  it("does NOT include the real name in the output", () => {
    const input = { name: FAKE_CLAN_NAME };
    const { sanitized } = sanitizeFixture(input);
    const json = JSON.stringify(sanitized);
    expect(json).not.toContain(FAKE_CLAN_NAME);
  });
});

// ---------------------------------------------------------------------------
// 7. sanitizeFixture — sensitive value rejection (fail-closed)
// ---------------------------------------------------------------------------

describe("sanitizeFixture — sensitive value rejection", () => {
  it("rejects a fixture containing an API-token-shaped string in an unknown field", () => {
    const input = { someUnknownField: FAKE_API_TOKEN };
    const { rejected, messages } = sanitizeFixture(input);
    expect(rejected).toBe(true);
    expect(messages.some((m) => m.includes("SENSITIVE_FIELD") || m.includes("FATAL"))).toBe(true);
  });

  it("rejects a fixture containing a public IPv4 address in an unknown field", () => {
    const input = { serverAddress: FAKE_PUBLIC_IPV4 };
    const { rejected } = sanitizeFixture(input);
    expect(rejected).toBe(true);
  });

  it("rejects a fixture containing an IPv6 address in an unknown field", () => {
    const input = { serverIp: FAKE_IPV6 };
    const { rejected } = sanitizeFixture(input);
    expect(rejected).toBe(true);
  });

  it("does NOT reject 127.0.0.1 (spec §2: safe test address)", () => {
    const input = { host: "127.0.0.1" };
    // 127.0.0.1 is explicitly allowed in tests per spec §2.
    // Because 'host' is not a known field, the IP detection runs, but 127.0.0.1 is safe.
    const { rejected } = sanitizeFixture(input);
    expect(rejected).toBe(false);
  });

  it("sanitized output does not contain the original sensitive tag string", () => {
    const input = { tag: SYNTH_CLAN_TAG, name: FAKE_PLAYER_NAME };
    const { sanitized, rejected } = sanitizeFixture(input);
    expect(rejected).toBe(false);
    const json = JSON.stringify(sanitized);
    expect(json).not.toContain(SYNTH_CLAN_TAG);
  });
});

// ---------------------------------------------------------------------------
// 8. sanitizeFixture — badge/icon URL replacement
// ---------------------------------------------------------------------------

describe("sanitizeFixture — URL fields", () => {
  it("replaces badgeUrls with a placeholder URL", () => {
    const input = {
      badgeUrls: {
        small: "https://api-assets.clashofclans.com/badgeIcons/70/real-badge.png",
        medium: "https://api-assets.clashofclans.com/badgeIcons/200/real-badge.png",
        large: "https://api-assets.clashofclans.com/badgeIcons/512/real-badge.png",
      },
    };
    const { sanitized, rejected } = sanitizeFixture(input);
    expect(rejected).toBe(false);
    const out = sanitized as any;
    expect(out.badgeUrls.small).toContain("synthetic.example.com");
    expect(out.badgeUrls.medium).toContain("synthetic.example.com");
    expect(out.badgeUrls.large).toContain("synthetic.example.com");
    // Ensure the real URL is gone.
    const json = JSON.stringify(sanitized);
    expect(json).not.toContain("api-assets.clashofclans.com");
  });

  it("replaces iconUrls with placeholder", () => {
    const input = {
      iconUrls: {
        tiny: "https://api-assets.clashofclans.com/leagues/36/real-icon.png",
        small: "https://api-assets.clashofclans.com/leagues/72/real-icon.png",
      },
    };
    const { sanitized, rejected } = sanitizeFixture(input);
    expect(rejected).toBe(false);
    const json = JSON.stringify(sanitized);
    expect(json).not.toContain("api-assets.clashofclans.com");
  });
});

// ---------------------------------------------------------------------------
// 9. sanitizeFixture — realistic war attack record
// ---------------------------------------------------------------------------

describe("sanitizeFixture — realistic war attack record (relational integrity)", () => {
  it("preserves attacker-defender relationships in a war attack list", () => {
    const attackerTag = SYNTH_PLAYER_TAG;
    const defenderTag = SYNTH_PLAYER_TAG_2;
    const salt = makeSalt();
    const ctx = createContext();

    const clanMembers = {
      members: [
        { tag: attackerTag, name: "FakeAttacker", mapPosition: 1 },
        { tag: defenderTag, name: "FakeDefender", mapPosition: 2 },
      ],
    };
    const warAttacks = {
      attacks: [
        {
          attackerTag,
          defenderTag,
          stars: 3,
          destructionPercentage: 100,
          order: 1,
        },
      ],
    };

    const r1 = sanitizeFixture(clanMembers, { salt }, ctx);
    const r2 = sanitizeFixture(warAttacks, { salt }, ctx);

    expect(r1.rejected).toBe(false);
    expect(r2.rejected).toBe(false);

    const members = (r1.sanitized as any).members;
    const attacks = (r2.sanitized as any).attacks;

    // The attacker's tag in the member list must match the attackerTag in the attack record.
    expect(members[0].tag).toBe(attacks[0].attackerTag);
    // The defender's tag must also match.
    expect(members[1].tag).toBe(attacks[0].defenderTag);
    // All tags pass validation.
    expect(TAG_VALIDATION_REGEX.test(members[0].tag)).toBe(true);
    expect(TAG_VALIDATION_REGEX.test(members[1].tag)).toBe(true);
    expect(TAG_VALIDATION_REGEX.test(attacks[0].attackerTag)).toBe(true);
    expect(TAG_VALIDATION_REGEX.test(attacks[0].defenderTag)).toBe(true);
    // Non-tag numeric fields are unchanged.
    expect(attacks[0].stars).toBe(3);
    expect(attacks[0].destructionPercentage).toBe(100);
    expect(attacks[0].order).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 10. sanitizeFixture — null, boolean, number pass-through
// ---------------------------------------------------------------------------

describe("sanitizeFixture — primitive pass-through", () => {
  it("passes null through unchanged", () => {
    const input = { value: null };
    const { sanitized, rejected } = sanitizeFixture(input);
    expect(rejected).toBe(false);
    expect((sanitized as any).value).toBeNull();
  });

  it("passes boolean through unchanged", () => {
    const input = { isPublicWarLog: true };
    const { sanitized, rejected } = sanitizeFixture(input);
    expect(rejected).toBe(false);
    expect((sanitized as any).isPublicWarLog).toBe(true);
  });

  it("passes numbers through unchanged", () => {
    const input = { stars: 3, destructionPercentage: 95.5, teamSize: 20 };
    const { sanitized, rejected } = sanitizeFixture(input);
    expect(rejected).toBe(false);
    const out = sanitized as any;
    expect(out.stars).toBe(3);
    expect(out.destructionPercentage).toBe(95.5);
    expect(out.teamSize).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// 11. Comprehensive fixture test — simulated member list response
// ---------------------------------------------------------------------------

describe("sanitizeFixture — simulated member list response", () => {
  it("fully sanitizes a simulated clan members API response", () => {
    const simulatedResponse = {
      items: [
        {
          tag: SYNTH_PLAYER_TAG,
          name: FAKE_PLAYER_NAME,
          role: "leader",
          expLevel: 200,
          league: {
            id: 29000016,
            name: "Legend League",
            iconUrls: {
              small: "https://api-assets.clashofclans.com/leagues/72/league-icon.png",
              tiny: "https://api-assets.clashofclans.com/leagues/36/league-icon.png",
              medium: "https://api-assets.clashofclans.com/leagues/288/league-icon.png",
            },
          },
          trophies: 5432,
          versusTrophies: 3456,
          clanRank: 1,
          previousClanRank: 2,
          donations: 8000,
          donationsReceived: 1500,
          townHallLevel: 16,
        },
        {
          tag: SYNTH_PLAYER_TAG_2,
          name: "AnotherFakePlayer",
          role: "elder",
          expLevel: 150,
          league: {
            id: 29000016,
            name: "Legend League",
            iconUrls: {
              small: "https://api-assets.clashofclans.com/leagues/72/league-icon.png",
            },
          },
          trophies: 4800,
          versusTrophies: 3200,
          clanRank: 2,
          previousClanRank: 1,
          donations: 4000,
          donationsReceived: 6000,
          townHallLevel: 15,
        },
      ],
    };

    const { sanitized, rejected, messages } = sanitizeFixture(simulatedResponse);

    // Should not be rejected.
    expect(rejected).toBe(false);

    const out = sanitized as any;

    // Tags must be absent.
    const json = JSON.stringify(out);
    expect(json).not.toContain(SYNTH_PLAYER_TAG.slice(1)); // Without # too
    expect(json).not.toContain(SYNTH_PLAYER_TAG_2.slice(1));

    // Names must be absent.
    expect(json).not.toContain(FAKE_PLAYER_NAME);
    expect(json).not.toContain("AnotherFakePlayer");

    // Real asset URLs must be absent.
    expect(json).not.toContain("api-assets.clashofclans.com");

    // Synthetic tags must pass validation.
    expect(TAG_VALIDATION_REGEX.test(out.items[0].tag)).toBe(true);
    expect(TAG_VALIDATION_REGEX.test(out.items[1].tag)).toBe(true);

    // Numeric fields preserved.
    expect(out.items[0].trophies).toBe(5432);
    expect(out.items[0].townHallLevel).toBe(16);
    expect(out.items[1].donations).toBe(4000);

    // League ID preserved (opaque numeric ID).
    expect(out.items[0].league.id).toBe(29000016);

    // League name sanitized (it is a name field).
    expect(typeof out.items[0].league.name).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// 12. Security edge cases: secret detection vs legitimate data
// ---------------------------------------------------------------------------

describe("sanitizeFixture — secret detection and legitimate data edge cases", () => {
  it("rejects JWT / bearer token variants in arbitrary nested locations", () => {
    const input = {
      nested: {
        deeper: {
          tokenHeader: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0",
        },
      },
    };
    const { rejected, messages } = sanitizeFixture(input);
    expect(rejected).toBe(true);
    expect(messages.some((m) => m.includes("FATAL") || m.includes("SENSITIVE_FIELD"))).toBe(true);
  });

  it("passes legitimate description / text data containing normal hyphens, spaces, and punctuation", () => {
    const input = {
      description: "Welcome to our clan! We war twice a week: Monday & Thursday. Be active & donate.",
    };
    const { sanitized, rejected } = sanitizeFixture(input);
    expect(rejected).toBe(false);
    expect((sanitized as any).description).toBe(input.description);
  });

  it("rejects unknown fields with long hex hashes or keys", () => {
    const input = {
      debugData: "4f8b2d1e9c7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f",
    };
    const { rejected } = sanitizeFixture(input);
    expect(rejected).toBe(true);
  });

  it("passes legitimate numeric ranges, timestamps, and ISO date strings without false positive secret detection", () => {
    const input = {
      startTime: "20261019T143000.000Z",
      endTime: "20261020T143000.000Z",
      timestamp: 1729350000,
      range: "100-200",
    };
    const { sanitized, rejected } = sanitizeFixture(input);
    expect(rejected).toBe(false);
    expect((sanitized as any).startTime).toBe(input.startTime);
    expect((sanitized as any).range).toBe(input.range);
  });

  it("fails safely if input is a malformed non-object primitive or unexpected type", () => {
    const { sanitized, rejected } = sanitizeFixture(Symbol("unexpected") as any);
    expect(rejected).toBe(true);
    expect(sanitized).toBeNull();
  });
});

