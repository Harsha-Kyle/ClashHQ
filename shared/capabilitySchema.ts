/**
 * Zod schema for shared/capabilities.json (ClashHQ capability registry).
 *
 * This schema is the canonical validator for the machine-readable registry
 * as required by CLASHHQ_SPEC.md v10, §12 "Machine-readable registry" and
 * §12 "Registry source of truth [v10]".
 *
 * Tests fail if:
 *   - A registry entry is missing a required property.
 *   - A feature depends on a capability with status unverified or unavailable
 *     without a declared safe fallback.
 *   - The registry and docs/api-notes.md disagree on status (checked by
 *     tests/registry-consistency.test.ts).
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Allowed status values
// ---------------------------------------------------------------------------
export const CapabilityStatus = z.enum([
  "supported",         // Field observed and behaviour verified from real captures.
  "field_observed",    // Field present in at least one real capture; behaviour not yet verified.
  "partial",           // Partially supported — some required fields present, others missing.
  "manual_entry",      // Feature works via manual entry only; automatic derivation unavailable.
  "unavailable",       // Endpoint or field confirmed absent from the official API.
  "unverified",        // No real capture yet; all entries start here.
]);

export type CapabilityStatus = z.infer<typeof CapabilityStatus>;

// Fallback values allowed when a capability is not fully supported.
export const FallbackBehaviour = z.enum([
  "disabled",      // Feature is hidden/disabled when capability is insufficient.
  "unknown",       // Feature shows "Unknown" with a reason.
  "partial",       // Feature shows available subset, with explicit gaps shown.
  "manual_entry",  // Feature falls back to manual data entry.
]);

// ---------------------------------------------------------------------------
// Verification evidence sub-object
// ---------------------------------------------------------------------------
export const VerificationEvidence = z.object({
  /** URL or section reference in the official API documentation. */
  docRef: z.string().min(1),
  /** ISO 8601 date string when the human ran the capture, or null if not yet run. */
  captureDate: z.string().datetime({ offset: true }).nullable(),
  /** True when the field was present in at least one real API response. */
  fieldObserved: z.boolean(),
  /** True when the field's behaviour (not just presence) was verified across captures. */
  behaviourVerified: z.boolean(),
  /** ID of the test in sanitizer.test.ts or registry-consistency.test.ts covering this capability. */
  testId: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Individual capability entry
// ---------------------------------------------------------------------------
export const Capability = z
  .object({
    /** Unique identifier. Must match the header line ID in docs/api-notes.md exactly. */
    id: z.string().regex(/^[a-z][a-z0-9-]*$/, "Capability ID must be lowercase-kebab-case"),

    /** The API endpoint path this capability exercises. */
    endpoint: z.string().min(1),

    /** Human-readable description of what this capability covers. */
    description: z.string().min(1),

    /**
     * Verification status. All entries start as "unverified".
     * The Phase 1 vertical slice requires at least "field_observed" for its dependency.
     */
    status: CapabilityStatus,

    /** True if the endpoint only returns current state (no history). */
    currentOnly: z.boolean(),

    /** True if the endpoint returns per-event detail (attacks, district attacks). */
    eventDetail: z.boolean(),

    /** True if the endpoint returns historical records (war log, raid seasons). */
    historical: z.boolean(),

    /** Human description of how long after an event the data remains available. */
    availabilityWindow: z.string().min(1),

    /** What can be recovered if a sync is missed during the availability window. */
    recoverabilityAfterMissedSync: z.string().min(1),

    /** Fields the app requires to be present for the capability to function at all. */
    requiredFields: z.array(z.string()),

    /** Fields that enhance the capability but whose absence is handled gracefully. */
    optionalFields: z.array(z.string()),

    /** List of feature IDs in the application that depend on this capability. */
    dependentFeatures: z.array(z.string()),

    /** Evidence from captures and documentation. */
    verificationEvidence: VerificationEvidence,

    /**
     * Fallback behaviour when the capability is unverified or unavailable.
     * A capability without a declared fallback blocks any dependent feature.
     */
    fallback: FallbackBehaviour,

    /** Human-readable description of the fallback behaviour. */
    fallbackDetail: z.string().min(1),

    /**
     * Minutes after which a successfully synced value for this capability is considered stale.
     * Defaults must be justified in docs/api-notes.md from observed availability windows.
     */
    freshnessThresholdMinutes: z.number().int().positive(),

    /**
     * Whether the endpoint operation allows per-record partial acceptance.
     * Defaults to false per spec §4.3 "Malformed and partial response outcome matrix [v10]".
     * If true, partialAcceptanceNote must be present.
     */
    allowPartialAcceptance: z.boolean(),

    /**
     * Required when allowPartialAcceptance is true.
     * Describes which records may be skipped and how the operation status is recorded.
     */
    partialAcceptanceNote: z.string().optional(),
  })
  .superRefine((cap, ctx) => {
    // A capability with status "unverified" or "unavailable" must have a declared fallback.
    // "disabled" is a valid fallback for unverified capabilities that block a feature.
    if (
      (cap.status === "unverified" || cap.status === "unavailable") &&
      !cap.fallback
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Capability "${cap.id}" has status "${cap.status}" but no declared fallback. A feature depending on it would be blocked (spec §12).`,
      });
    }

    // If allowPartialAcceptance is true, partialAcceptanceNote must be present.
    if (cap.allowPartialAcceptance && !cap.partialAcceptanceNote) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Capability "${cap.id}" has allowPartialAcceptance: true but no partialAcceptanceNote (spec §4.3).`,
      });
    }

    // behaviourVerified cannot be true without fieldObserved being true first.
    if (
      cap.verificationEvidence.behaviourVerified &&
      !cap.verificationEvidence.fieldObserved
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Capability "${cap.id}" has behaviourVerified: true but fieldObserved: false. A field must be observed before its behaviour can be verified.`,
      });
    }

    // If fieldObserved is true, captureDate must be set.
    if (
      cap.verificationEvidence.fieldObserved &&
      cap.verificationEvidence.captureDate === null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Capability "${cap.id}" has fieldObserved: true but captureDate is null. Set captureDate to the date the capture was run.`,
      });
    }
  });

export type Capability = z.infer<typeof Capability>;

// ---------------------------------------------------------------------------
// Root registry schema
// ---------------------------------------------------------------------------
export const CapabilityRegistry = z
  .object({
    $schema: z.string().optional(),
    registryVersion: z.string().regex(/^\d+\.\d+\.\d+$/, "Must be semver"),
    specVersion: z.string().min(1),
    generatedAt: z.string().datetime({ offset: true }),
    note: z.string().optional(),
    capabilities: z.array(Capability).min(1),
  })
  .superRefine((registry, ctx) => {
    // Enforce unique IDs.
    const seen = new Set<string>();
    for (const cap of registry.capabilities) {
      if (seen.has(cap.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate capability ID: "${cap.id}". IDs must be unique (spec §12).`,
        });
      }
      seen.add(cap.id);
    }
  });

export type CapabilityRegistry = z.infer<typeof CapabilityRegistry>;

// ---------------------------------------------------------------------------
// Helper: load and validate the registry from a parsed JSON object.
// Throws ZodError with all issues if validation fails.
// ---------------------------------------------------------------------------
export function validateRegistry(raw: unknown): CapabilityRegistry {
  return CapabilityRegistry.parse(raw);
}
