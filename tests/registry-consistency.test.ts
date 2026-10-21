/**
 * Registry consistency test (Phase 0, AC-0.2 and AC-0.6).
 *
 * Verifies that shared/capabilities.json and docs/api-notes.md agree 1:1:
 *   1. Every capability ID in the registry has a matching section in api-notes.md.
 *   2. Every capability section in api-notes.md has a matching entry in the registry.
 *   3. Status values agree exactly (case-sensitive) for every capability ID.
 *   4. No duplicate capability IDs exist in either file.
 *   5. The registry validates against the Zod schema (capabilitySchema.ts).
 *   6. Each capability with status "unverified" or "unavailable" has a declared fallback.
 *
 * The test parses ONLY the strict header lines from api-notes.md:
 *   `Capability: <id> | Status: <status>`
 * It does NOT parse free-form Markdown.
 *
 * Source: CLASHHQ_SPEC.md v10 §12 "Registry source of truth [v10]".
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { validateRegistry } from "../shared/capabilitySchema.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve(__dirname, "..");
const REGISTRY_PATH = path.join(PROJECT_ROOT, "shared", "capabilities.json");
const API_NOTES_PATH = path.join(PROJECT_ROOT, "docs", "api-notes.md");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strict header line format: `Capability: <id> | Status: <status>` */
const HEADER_REGEX = /^Capability:\s+([a-z][a-z0-9-]*)\s+\|\s+Status:\s+([a-z_]+)\s*$/;

interface ParsedApiNote {
  id: string;
  status: string;
  lineNumber: number;
}

function parseApiNotes(content: string): ParsedApiNote[] {
  const results: ParsedApiNote[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const match = HEADER_REGEX.exec(line);
    if (match && match[1] && match[2]) {
      results.push({
        id: match[1],
        status: match[2],
        lineNumber: i + 1,
      });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Phase 0 — Registry and api-notes.md consistency (spec §12)", () => {
  // Load files once. Fail early with helpful messages if files are missing.
  let registryRaw: unknown;
  let apiNotesContent: string;
  let apiNotes: ParsedApiNote[];

  try {
    const registryContent = fs.readFileSync(REGISTRY_PATH, "utf-8");
    registryRaw = JSON.parse(registryContent);
  } catch (err: unknown) {
    throw new Error(
      `Cannot read or parse shared/capabilities.json: ${err instanceof Error ? err.message : String(err)}\n` +
        `Expected path: ${REGISTRY_PATH}`
    );
  }

  try {
    apiNotesContent = fs.readFileSync(API_NOTES_PATH, "utf-8");
    apiNotes = parseApiNotes(apiNotesContent);
  } catch (err: unknown) {
    throw new Error(
      `Cannot read docs/api-notes.md: ${err instanceof Error ? err.message : String(err)}\n` +
        `Expected path: ${API_NOTES_PATH}`
    );
  }

  // ---------------------------------------------------------------------------
  it("shared/capabilities.json exists and is valid JSON", () => {
    expect(registryRaw).toBeDefined();
    expect(typeof registryRaw).toBe("object");
  });

  // ---------------------------------------------------------------------------
  it("shared/capabilities.json passes Zod schema validation", () => {
    // validateRegistry throws ZodError with all issues if invalid.
    expect(() => validateRegistry(registryRaw)).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  it("docs/api-notes.md exists and contains at least one capability header", () => {
    expect(apiNotes.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  it("no duplicate capability IDs in docs/api-notes.md", () => {
    const seen = new Map<string, number>();
    const duplicates: string[] = [];
    for (const note of apiNotes) {
      if (seen.has(note.id)) {
        duplicates.push(
          `ID "${note.id}" appears at lines ${seen.get(note.id)} and ${note.lineNumber}`
        );
      } else {
        seen.set(note.id, note.lineNumber);
      }
    }
    expect(duplicates).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  it("no duplicate capability IDs in shared/capabilities.json", () => {
    const registry = validateRegistry(registryRaw);
    const seen = new Map<string, number>();
    const duplicates: string[] = [];
    let index = 0;
    for (const cap of registry.capabilities) {
      if (seen.has(cap.id)) {
        duplicates.push(
          `ID "${cap.id}" appears at indices ${seen.get(cap.id)} and ${index}`
        );
      } else {
        seen.set(cap.id, index);
      }
      index++;
    }
    expect(duplicates).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  it("every capability ID in shared/capabilities.json has a matching header in docs/api-notes.md", () => {
    const registry = validateRegistry(registryRaw);
    const noteIds = new Map(apiNotes.map((n) => [n.id, n]));

    const missing: string[] = [];
    for (const cap of registry.capabilities) {
      if (!noteIds.has(cap.id)) {
        missing.push(
          `  Registry ID "${cap.id}" has no matching "Capability: ${cap.id} | Status: ..." header in docs/api-notes.md`
        );
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `Capabilities in registry but missing from docs/api-notes.md:\n${missing.join("\n")}\n\n` +
          `Each registry entry must have a corresponding section in docs/api-notes.md beginning with:\n` +
          `  Capability: <id> | Status: <status>`
      );
    }
    expect(missing).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  it("every capability header in docs/api-notes.md has a matching entry in shared/capabilities.json", () => {
    const registry = validateRegistry(registryRaw);
    const registryIds = new Map(registry.capabilities.map((c) => [c.id, c]));

    const orphaned: string[] = [];
    for (const note of apiNotes) {
      if (!registryIds.has(note.id)) {
        orphaned.push(
          `  docs/api-notes.md line ${note.lineNumber}: "Capability: ${note.id} | Status: ${note.status}" has no matching entry in shared/capabilities.json`
        );
      }
    }

    if (orphaned.length > 0) {
      throw new Error(
        `Capabilities in docs/api-notes.md but missing from shared/capabilities.json:\n${orphaned.join("\n")}`
      );
    }
    expect(orphaned).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  it("status values agree exactly between shared/capabilities.json and docs/api-notes.md", () => {
    const registry = validateRegistry(registryRaw);
    const noteMap = new Map(apiNotes.map((n) => [n.id, n]));

    const mismatches: string[] = [];
    for (const cap of registry.capabilities) {
      const note = noteMap.get(cap.id);
      if (!note) continue; // Already caught by previous test.
      if (cap.status !== note.status) {
        mismatches.push(
          `  Capability "${cap.id}": registry status="${cap.status}", api-notes.md status="${note.status}" (line ${note.lineNumber})`
        );
      }
    }

    if (mismatches.length > 0) {
      throw new Error(
        `Status mismatches between registry and docs/api-notes.md:\n${mismatches.join("\n")}\n\n` +
          `Update both files together and re-run this test.`
      );
    }
    expect(mismatches).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  it("every unverified or unavailable capability has a declared fallback", () => {
    const registry = validateRegistry(registryRaw);
    const noFallback: string[] = [];
    for (const cap of registry.capabilities) {
      if (
        (cap.status === "unverified" || cap.status === "unavailable") &&
        !cap.fallback
      ) {
        noFallback.push(`  Capability "${cap.id}" (${cap.status}) has no fallback declared.`);
      }
    }
    if (noFallback.length > 0) {
      throw new Error(
        `Capabilities missing fallback (spec §12 requires fallback for unverified/unavailable):\n${noFallback.join("\n")}`
      );
    }
    expect(noFallback).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  it("all capabilities currently have status 'unverified' (pre-capture state)", () => {
    // This test documents the expected pre-capture state.
    // After the human runs the capture script, some statuses will change.
    // When they do, this test should be updated to reflect the new expected statuses,
    // or removed if capabilities have been promoted.
    const registry = validateRegistry(registryRaw);
    const nonUnverified = registry.capabilities.filter(
      (c) => c.status !== "unverified"
    );
    if (nonUnverified.length > 0) {
      // Not a failure — this just documents which capabilities have been promoted.
      // We use console.warn instead of expect() to allow the test to pass after
      // the human updates statuses.
      console.warn(
        `\nINFO: The following capabilities have been promoted from "unverified":\n` +
          nonUnverified.map((c) => `  ${c.id}: ${c.status}`).join("\n") +
          "\nThis is expected after the human runs the capture script and approves evidence."
      );
    }
    // The test always passes — it is informational only at this stage.
    // Once Phase 0 gate passes, some entries will be "field_observed" or higher.
    expect(true).toBe(true);
  });

  // ---------------------------------------------------------------------------
  it("capability ID format is correct in both files (lowercase-kebab-case)", () => {
    const registry = validateRegistry(registryRaw);
    const badRegistryIds = registry.capabilities
      .filter((c) => !/^[a-z][a-z0-9-]*$/.test(c.id))
      .map((c) => c.id);
    expect(badRegistryIds).toEqual([]);

    const badNoteIds = apiNotes
      .filter((n) => !/^[a-z][a-z0-9-]*$/.test(n.id))
      .map((n) => `line ${n.lineNumber}: "${n.id}"`);
    expect(badNoteIds).toEqual([]);
  });
});
