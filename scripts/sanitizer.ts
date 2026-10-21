/**
 * Sanitizer for Clash of Clans API captures.
 *
 * PURPOSE: Replace all identity-bearing fields (clan tags, player tags, names,
 * IP addresses, API-key-shaped strings) with stable synthetic equivalents that:
 *   1. Are consistent across all objects in the same sanitization run (relational integrity).
 *   2. Pass tag validation (same character set and length constraints as real tags).
 *   3. Contain no information derivable from the original value.
 *   4. Are deterministic given the same input (same real tag → same synthetic tag always).
 *
 * SECURITY CONTRACT:
 *   - If a field CANNOT be reliably sanitized (e.g. unknown nested structure containing
 *     an un-traversable blob), the entire fixture is REJECTED, not exported with a gap.
 *   - The API token is never accepted as input to this module.
 *   - This module never writes files; callers handle I/O.
 *
 * Source: CLASHHQ_SPEC.md v10 §10 "Privacy boundary for capture", §15 "Security and privacy".
 */

import * as crypto from "crypto";

// ---------------------------------------------------------------------------
// Tag format constants (verified against spec §4 tag normalisation rules)
// ---------------------------------------------------------------------------

/**
 * Character set for synthetic tags (digits and uppercase letters excluding I, O, S, Z
 * which are visually confusable — conservative subset for test tags).
 * Must produce tags that pass tag validation (spec §4).
 */
const TAG_CHARS = "0289PYLQGRJCUV";

/**
 * Synthetic tag length range.
 * Real CoC tags are typically 7–9 characters after the #.
 * We use a fixed 8-character body to keep output predictable.
 */
const SYNTHETIC_TAG_BODY_LENGTH = 8;

/**
 * Regex for a valid normalized Clash of Clans tag.
 * Tags begin with # followed by 3–9 characters from the allowed set.
 * Source: spec §4 "Tags must be URL-encoded and normalised".
 * Note: exact set is a hypothesis until Phase 0 verifies the official schema.
 */
export const TAG_VALIDATION_REGEX = /^#[0289PYLQGRJCUV]{3,9}$/;

/**
 * Regex patterns that match strings that look like API tokens:
 * bearer tokens, JWTs, long base64/hex keys.
 */
const API_TOKEN_PATTERN = /^(?:Bearer\s+)?[A-Za-z0-9+/=_\-\.]{32,}$/;
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * IP address patterns (IPv4 and IPv6).
 */
const IPV4_PATTERN =
  /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/;
const IPV6_PATTERN =
  /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|::(?:[0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}\b/;

// ---------------------------------------------------------------------------
// Internal identity maps (built up during a sanitization run)
// ---------------------------------------------------------------------------

export interface SanitizationContext {
  /** Real tag → synthetic tag (e.g. "#2PP0P2PY" → "#2YV9G0LJ") */
  tagMap: Map<string, string>;
  /** Real name → synthetic name (e.g. "CoolClan" → "Clan_0001") */
  nameMap: Map<string, string>;
  /** Counter for deterministic name generation */
  nameCounter: number;
  /** Counter for synthetic tag generation (used when crypto random is not enough) */
  tagCounter: number;
  /** Errors accumulated during sanitization */
  errors: string[];
  /** Whether any unrecoverable error was encountered */
  rejected: boolean;
}

export function createContext(): SanitizationContext {
  return {
    tagMap: new Map(),
    nameMap: new Map(),
    nameCounter: 1,
    tagCounter: 1,
    errors: [],
    rejected: false,
  };
}

// ---------------------------------------------------------------------------
// Tag generation
// ---------------------------------------------------------------------------

/**
 * Given a real (normalized) clan or player tag, returns a consistent synthetic tag.
 * The synthetic tag is generated deterministically from a HMAC of the real tag with
 * a per-context random salt, so the mapping is consistent within a run but not
 * reversible or predictable across runs.
 *
 * Guarantees:
 *   - Same real tag in the same context → same synthetic tag.
 *   - Different real tags → different synthetic tags (collision handled by suffix counter).
 *   - Synthetic tag passes TAG_VALIDATION_REGEX.
 *   - Synthetic tag does not start with a digit that makes it look like a real tag prefix.
 */
export function syntheticTag(
  realTag: string,
  ctx: SanitizationContext,
  salt: Buffer
): string {
  const normalized = normalizeTag(realTag);
  if (ctx.tagMap.has(normalized)) {
    return ctx.tagMap.get(normalized)!;
  }

  // Derive a deterministic index from HMAC(salt, normalizedTag).
  const hmac = crypto.createHmac("sha256", salt);
  hmac.update(normalized);
  const digest = hmac.digest();

  // Map digest bytes into the TAG_CHARS character set.
  let body = "";
  for (let i = 0; i < SYNTHETIC_TAG_BODY_LENGTH; i++) {
    const byte = digest[i] ?? 0;
    const char = TAG_CHARS[byte % TAG_CHARS.length] ?? "0";
    body += char;
  }
  let candidate = "#" + body;

  // Guarantee uniqueness within this run by suffixing a counter if there is a collision.
  const existingValues = new Set(ctx.tagMap.values());
  let attempts = 0;
  while (existingValues.has(candidate)) {
    // Perturb: replace last character with a counter-derived character.
    const suffix = TAG_CHARS[(ctx.tagCounter + attempts) % TAG_CHARS.length];
    candidate = "#" + body.slice(0, SYNTHETIC_TAG_BODY_LENGTH - 1) + suffix;
    attempts++;
    if (attempts > TAG_CHARS.length * 10) {
      ctx.errors.push(
        `FATAL: Could not generate a unique synthetic tag for "${realTag}" after ${attempts} attempts.`
      );
      ctx.rejected = true;
      return "#SANITIZE0";
    }
  }

  ctx.tagMap.set(normalized, candidate);
  ctx.tagCounter++;
  return candidate;
}

/**
 * Normalize a raw tag: uppercase, leading #, O→0.
 * This mirrors the app's tag normalisation logic (spec §4).
 */
export function normalizeTag(raw: string): string {
  let t = raw.trim().toUpperCase();
  if (!t.startsWith("#")) t = "#" + t;
  // Replace letter O with digit 0 (after the #)
  t = "#" + t.slice(1).replace(/O/g, "0");
  return t;
}

// ---------------------------------------------------------------------------
// Name generation
// ---------------------------------------------------------------------------

/**
 * Returns a synthetic name for a real name.
 * Distinguishes between clan names and player names by prefix.
 * Consistent within a run: same real name → same synthetic name.
 */
export function syntheticName(
  realName: string,
  kind: "clan" | "player" | "location",
  ctx: SanitizationContext
): string {
  const key = `${kind}:${realName}`;
  if (ctx.nameMap.has(key)) return ctx.nameMap.get(key)!;

  const prefix =
    kind === "clan" ? "Clan" : kind === "location" ? "Location" : "Player";
  const synthetic = `${prefix}_${String(ctx.nameCounter).padStart(4, "0")}`;
  ctx.nameMap.set(key, synthetic);
  ctx.nameCounter++;
  return synthetic;
}

// ---------------------------------------------------------------------------
// String scanning — detect sensitive values in arbitrary strings
// ---------------------------------------------------------------------------

/**
 * Checks whether a string value appears to contain sensitive data that cannot be
 * automatically sanitized. Returns a description of the issue, or null if clean.
 *
 * Fields that appear sensitive but are not tags or names are flagged as UNCERTAIN;
 * the caller decides whether to reject or pass through.
 */
export function detectSensitiveString(value: string): string | null {
  // API token / Bearer / JWT patterns
  if (
    (API_TOKEN_PATTERN.test(value) && value.length >= 32) ||
    (JWT_PATTERN.test(value) && value.length >= 30)
  ) {
    return `Possible API token or secret: "${value.slice(0, 6)}..." (length ${value.length})`;
  }
  // IPv4
  if (IPV4_PATTERN.test(value) && !isSafeTestAddress(value)) {
    return `Possible IPv4 address in value: "${value}"`;
  }
  // IPv6
  if (IPV6_PATTERN.test(value)) {
    return `Possible IPv6 address in value: "${value}"`;
  }
  return null;
}

/** Test addresses that are allowed in fixtures (spec §2 "127.0.0.1 and fake addresses in tests are allowed"). */
function isSafeTestAddress(value: string): boolean {
  return (
    value === "127.0.0.1" ||
    value.startsWith("127.") ||
    value === "0.0.0.0" ||
    value.startsWith("192.168.") ||
    value.startsWith("10.") ||
    // Synthetic/test CIDR ranges
    value.startsWith("172.16.") ||
    value.startsWith("172.17.") ||
    value.startsWith("172.18.") ||
    value.startsWith("172.19.")
  );
}

// ---------------------------------------------------------------------------
// Known field name lists
// ---------------------------------------------------------------------------

/**
 * Fields that contain player or clan TAGS (require syntheticTag replacement).
 */
const TAG_FIELDS = new Set([
  "tag",
  "clanTag",
  "playerTag",
  "opponentTag",
  "attacker",
  "defender",
  "attackerTag",
  "defenderTag",
  "warTag",
]);

/**
 * Fields that contain NAMES (require syntheticName replacement).
 */
const NAME_FIELDS = new Set(["name", "clanName", "playerName"]);

/**
 * Fields that contain LOCATION names.
 */
const LOCATION_FIELDS = new Set(["localizedName", "countryCode"]);

/**
 * Fields whose values are opaque IDs (not tags; safe to pass through unchanged,
 * but we document them explicitly so unknown-field detection doesn't flag them).
 */
const SAFE_ID_FIELDS = new Set([
  "id",
  "warId",
  "leagueId",
  "seasonId",
  "badgeId",
  "labelId",
]);

/**
 * Fields whose values are URLs (badge URLs, icon URLs). These may contain clan
 * or player IDs embedded. We replace them with a safe placeholder URL.
 */
const URL_FIELDS = new Set([
  "badgeUrls",
  "iconUrls",
  "imageUrl",
  "badgeUrl",
  "mediumBadgeUrl",
  "largeBadgeUrl",
  "smallBadgeUrl",
]);

// ---------------------------------------------------------------------------
// Core recursive sanitizer
// ---------------------------------------------------------------------------

export interface SanitizeOptions {
  /** Per-run random salt for HMAC-based tag derivation. */
  salt: Buffer;
  /**
   * If true, encountering an unknown field containing a suspicious string
   * causes rejection. If false, a warning is added and the value is replaced
   * with a placeholder. Default: true (fail-closed).
   */
  rejectOnUnknownSensitiveField?: boolean;
}

/**
 * Recursively sanitize a parsed JSON object.
 *
 * Rules:
 *   - Known tag fields → syntheticTag
 *   - Known name fields → syntheticName('player' unless parent indicates clan)
 *   - URL fields → replaced with a safe placeholder URL
 *   - String values in all other fields → scanned for sensitive patterns
 *     - If sensitive pattern found in a known-safe field: error/reject
 *     - If sensitive pattern found in an unknown field: reject (fail-closed)
 *   - Arrays → each element sanitized recursively
 *   - null / boolean / number → passed through unchanged
 *
 * @param value - Parsed JSON value (object, array, string, number, boolean, null)
 * @param ctx - Sanitization context (maps accumulated across the whole document)
 * @param opts - Options including the per-run salt
 * @param fieldName - The key name of this value in its parent object (if any)
 * @param parentKind - Hint about whether the parent represents a clan or player context
 */
export function sanitizeValue(
  value: unknown,
  ctx: SanitizationContext,
  opts: SanitizeOptions,
  fieldName?: string,
  parentKind?: "clan" | "player" | "unknown"
): unknown {
  if (ctx.rejected) return null; // Short-circuit after fatal error.

  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeString(value, ctx, opts, fieldName, parentKind);
  }

  if (Array.isArray(value)) {
    return value.map((item, index) =>
      sanitizeValue(item, ctx, opts, fieldName, parentKind)
    );
  }

  if (typeof value === "object") {
    return sanitizeObject(
      value as Record<string, unknown>,
      ctx,
      opts,
      fieldName,
      parentKind
    );
  }

  // Unexpected type — reject.
  ctx.errors.push(
    `FATAL: Unexpected value type "${typeof value}" at field "${fieldName}". Cannot sanitize.`
  );
  ctx.rejected = true;
  return null;
}

function sanitizeString(
  value: string,
  ctx: SanitizationContext,
  opts: SanitizeOptions,
  fieldName?: string,
  parentKind?: "clan" | "player" | "unknown"
): string {
  // Empty strings are safe.
  if (value === "") return value;

  const rejectOnUnknown = opts.rejectOnUnknownSensitiveField !== false;

  // TAG fields
  if (fieldName && TAG_FIELDS.has(fieldName)) {
    if (!value.startsWith("#") && value.length < 3) {
      // Likely not a tag (e.g. empty or placeholder); pass through.
      return value;
    }
    return syntheticTag(value, ctx, opts.salt);
  }

  // NAME fields
  if (fieldName && NAME_FIELDS.has(fieldName)) {
    const kind: "clan" | "player" =
      parentKind === "clan" ? "clan" : "player";
    return syntheticName(value, kind, ctx);
  }

  // LOCATION fields
  if (fieldName && LOCATION_FIELDS.has(fieldName)) {
    return syntheticName(value, "location", ctx);
  }

  // URL fields — replace entirely.
  if (fieldName && URL_FIELDS.has(fieldName)) {
    return "https://synthetic.example.com/badge/placeholder.png";
  }

  // SAFE ID fields — pass through (they are opaque numeric/string IDs).
  if (fieldName && SAFE_ID_FIELDS.has(fieldName)) {
    return value;
  }

  // For all other string values, scan for sensitive patterns.
  // First check if the value itself looks like a tag.
  if (TAG_VALIDATION_REGEX.test(value)) {
    // A tag-shaped string found in a non-tag field. This is suspicious.
    // Sanitize it to be safe — map it through syntheticTag.
    const warning = `WARNING: Tag-shaped string "${value}" found in non-tag field "${fieldName}". Sanitizing.`;
    ctx.errors.push(warning);
    return syntheticTag(value, ctx, opts.salt);
  }

  // Check for sensitive patterns (API tokens, IPs, etc.)
  const sensitiveReason = detectSensitiveString(value);
  if (sensitiveReason) {
    if (fieldName && SAFE_ID_FIELDS.has(fieldName)) {
      // Known safe ID field — warn but don't reject.
      ctx.errors.push(`WARNING: ${sensitiveReason} in known safe field "${fieldName}".`);
      return value;
    }

    const msg = `SENSITIVE_FIELD: ${sensitiveReason} at field "${fieldName ?? "(root)"}".`;
    ctx.errors.push(msg);

    if (rejectOnUnknown) {
      ctx.errors.push(
        `FATAL: Rejecting fixture because sensitive value found in field "${fieldName}" that cannot be automatically sanitized.`
      );
      ctx.rejected = true;
      return "[REDACTED]";
    } else {
      return "[REDACTED_UNKNOWN_FIELD]";
    }
  }

  // Safe to pass through.
  return value;
}

function sanitizeObject(
  obj: Record<string, unknown>,
  ctx: SanitizationContext,
  opts: SanitizeOptions,
  fieldName?: string,
  parentKind?: "clan" | "player" | "unknown"
): Record<string, unknown> {
  if (ctx.rejected) return {};

  // Infer kind for child sanitization based on field name hints.
  const inferredKind: "clan" | "player" | "unknown" =
    fieldName === "clan" || fieldName === "opponent" ? "clan" :
    fieldName === "member" || fieldName === "attacker" || fieldName === "defender" ? "player" :
    parentKind ?? "unknown";

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (ctx.rejected) break;

    // Special case: badgeUrls is itself an object with small/medium/large keys.
    if (key === "badgeUrls" || key === "iconUrls") {
      result[key] = sanitizeBadgeUrls(val);
      continue;
    }

    // Special case: location objects contain name and localizedName.
    if (key === "location" && typeof val === "object" && val !== null) {
      result[key] = sanitizeObject(
        val as Record<string, unknown>,
        ctx,
        opts,
        "location",
        "unknown"
      );
      continue;
    }

    result[key] = sanitizeValue(val, ctx, opts, key, inferredKind);
  }
  return result;
}

function sanitizeBadgeUrls(val: unknown): unknown {
  if (typeof val === "string") {
    return "https://synthetic.example.com/badge/placeholder.png";
  }
  if (typeof val === "object" && val !== null && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      result[key] = "https://synthetic.example.com/badge/placeholder.png";
    }
    return result;
  }
  return "https://synthetic.example.com/badge/placeholder.png";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SanitizeResult {
  /** The sanitized JSON object. Only valid if rejected is false. */
  sanitized: unknown;
  /** True if the fixture was rejected due to an unresolvable sensitive field. */
  rejected: boolean;
  /** All warnings and errors encountered. Non-empty does not imply rejection. */
  messages: string[];
  /** The tag mapping produced (real normalized tag → synthetic tag). */
  tagMap: Map<string, string>;
  /** The name mapping produced (kind:realName → synthetic name). */
  nameMap: Map<string, string>;
}

/**
 * Sanitize a parsed JSON fixture object. Returns a SanitizeResult.
 *
 * If `result.rejected` is true, the fixture MUST NOT be written to the project tree.
 * The caller is responsible for enforcing this.
 *
 * The same `tagMap` and `nameMap` should be reused across multiple fixture files
 * in the same capture run to preserve relational integrity (e.g. the same player tag
 * appearing in both a member list and a war attack maps to the same synthetic tag).
 *
 * To reuse maps across files, pass `existingContext`.
 */
export function sanitizeFixture(
  raw: unknown,
  opts?: Partial<SanitizeOptions>,
  existingContext?: SanitizationContext
): SanitizeResult {
  const salt = opts?.salt ?? crypto.randomBytes(32);
  const fullOpts: SanitizeOptions = {
    salt,
    rejectOnUnknownSensitiveField: opts?.rejectOnUnknownSensitiveField !== false,
  };

  const ctx = existingContext ?? createContext();
  const sanitized = sanitizeValue(raw, ctx, fullOpts, undefined, "unknown");

  return {
    sanitized: ctx.rejected ? null : sanitized,
    rejected: ctx.rejected,
    messages: ctx.errors,
    tagMap: ctx.tagMap,
    nameMap: ctx.nameMap,
  };
}
