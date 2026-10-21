/**
 * Fixture capture script for ClashHQ Phase 0.
 *
 * HUMAN RUNS THIS SCRIPT with their own API key and clan tags.
 * The agent never sees, stores, or processes the API token or raw captures.
 *
 * Usage:
 *   npx ts-node scripts/capture-fixtures.ts \
 *     --raw-output "C:\Users\<you>\clashhq-raw-captures" \
 *     --fixtures-output "./fixtures" \
 *     --clan-tag "#YOURCLAN" \
 *     [--player-tag "#YOURPLAYER"]
 *
 * The script will:
 *   1. Validate the --raw-output path is outside the project tree (FAIL CLOSED).
 *   2. Prompt for the API token via stdin (never via argument, never logged).
 *   3. Fetch API responses for the capability list in §12 of the spec.
 *   4. Write raw (unsanitized) responses to --raw-output (OUTSIDE the repo).
 *   5. Sanitize each response via scripts/sanitizer.ts.
 *   6. Write sanitized fixtures to --fixtures-output (inside the repo, safe).
 *   7. Report which capabilities were field_observed vs still unverified.
 *
 * SECURITY:
 *   - The API token is read from stdin and held in memory only.
 *   - The token is NEVER logged, echoed, written to disk, or included in error messages.
 *   - Raw captures are written ONLY to the path outside the project tree.
 *   - If the sanitizer rejects a fixture, that file is NOT written to fixtures-output.
 *   - Path traversal and symlink attacks are mitigated before any write.
 *
 * Source: CLASHHQ_SPEC.md v10 §10 Phase 0, §15 "Security and privacy".
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import * as tty from "tty";
import * as https from "https";
import * as crypto from "crypto";
import { fileURLToPath } from "url";
import {
  sanitizeFixture,
  normalizeTag,
  TAG_VALIDATION_REGEX,
  createContext,
  type SanitizationContext,
} from "./sanitizer.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = "https://api.clashofclans.com/v1";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Absolute path to the project root (resolved at startup, handling both ts and compiled dist locations). */
const PROJECT_ROOT = path.basename(path.resolve(__dirname, "..")) === "dist"
  ? path.resolve(__dirname, "../..")
  : path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

export interface CliArgs {
  rawOutput: string;
  fixturesOutput: string;
  clanTag: string;
  playerTag: string | null;
}

export function parseCliArgs(rawArgs: string[]): CliArgs {
  if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
    console.log(
      "ClashHQ Phase 0 Capture Tool\n\n" +
        "Usage:\n" +
        "  npm run capture -- --raw-output <path> --fixtures-output <path> --clan-tag <tag> [--player-tag <tag>]\n\n" +
        "Required Arguments:\n" +
        "  --raw-output       Directory OUTSIDE the project tree where raw API captures are stored.\n" +
        "  --fixtures-output  Directory INSIDE the project tree where sanitized fixtures are written.\n" +
        "  --clan-tag         Normalized clan tag (e.g. #2PP0).\n\n" +
        "Optional Arguments:\n" +
        "  --player-tag       Normalized player tag (e.g. #9QQ0) to test player profile endpoints.\n" +
        "  --help, -h         Show this help message.\n"
    );
    process.exit(0);
  }

  const recognizedFlags = new Set(["--raw-output", "--fixtures-output", "--clan-tag", "--player-tag"]);
  const parsed = new Map<string, string>();

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === undefined) continue;

    if (arg.startsWith("--")) {
      const eqIndex = arg.indexOf("=");
      if (eqIndex !== -1) {
        const flag = arg.slice(0, eqIndex);
        const val = arg.slice(eqIndex + 1);
        if (!recognizedFlags.has(flag)) {
          fatal(`Unknown option: "${flag}"`);
        }
        if (!val) {
          fatal(`Missing value for argument: "${flag}"`);
        }
        parsed.set(flag, val);
      } else {
        const flag = arg;
        if (!recognizedFlags.has(flag)) {
          fatal(`Unknown option: "${flag}"`);
        }
        const nextArg = rawArgs[i + 1];
        if (nextArg === undefined || nextArg.startsWith("--")) {
          fatal(`Missing value for argument: "${flag}"`);
        }
        parsed.set(flag, nextArg);
        i++; // skip value
      }
    } else {
      fatal(`Unexpected positional argument: "${arg}". All options must be preceded by their flag (e.g. --clan-tag #TAG).`);
    }
  }

  const rawOutput = parsed.get("--raw-output");
  const fixturesOutput = parsed.get("--fixtures-output");
  const clanTag = parsed.get("--clan-tag");
  const playerTag = parsed.get("--player-tag") ?? null;

  if (!rawOutput) {
    fatal(
      "Missing --raw-output argument.\n" +
        "Provide a path OUTSIDE the project tree for raw (unsanitized) captures.\n" +
        "Example: --raw-output \"C:\\Users\\you\\clashhq-raw-captures\""
    );
  }
  if (!fixturesOutput) {
    fatal("Missing --fixtures-output argument.\nExample: --fixtures-output \"./fixtures\"");
  }
  if (!clanTag) {
    fatal("Missing --clan-tag argument.\nExample: --clan-tag \"#YOURCLAN\"");
  }

  return {
    rawOutput,
    fixturesOutput,
    clanTag,
    playerTag,
  };
}

function parseArgs(): CliArgs {
  return parseCliArgs(process.argv.slice(2));
}

// ---------------------------------------------------------------------------
// Path safety — enforce raw output is outside the project tree
// ---------------------------------------------------------------------------

/**
 * Resolves a path to its real absolute path, following symlinks where they exist.
 * For paths that don't exist yet, resolves as far as possible and uses path.resolve
 * for the remainder.
 */
function safeResolve(inputPath: string): string {
  let resolved = path.resolve(inputPath);

  // Walk up until we find a path that exists, resolve symlinks there,
  // then re-append the non-existent suffix.
  let suffix = "";
  let current = resolved;
  while (current !== path.dirname(current)) {
    if (fs.existsSync(current)) {
      try {
        const real = fs.realpathSync(current);
        resolved = suffix ? path.join(real, suffix) : real;
        break;
      } catch {
        // If realpathSync fails (race or permission), keep the path.resolve result.
        break;
      }
    }
    suffix = suffix
      ? path.join(path.basename(current), suffix)
      : path.basename(current);
    current = path.dirname(current);
  }

  return resolved;
}

/**
 * Validates that the raw output path is OUTSIDE the project tree.
 * This is a CODE-LEVEL enforcement (not just .gitignore).
 *
 * Checks:
 *   1. The resolved path does not start with PROJECT_ROOT.
 *   2. No ancestor of the path is a symlink that resolves inside PROJECT_ROOT.
 *
 * Exits with code 1 if the path is unsafe.
 */
function enforceRawOutputOutsideProject(rawOutput: string): string {
  const resolvedRaw = safeResolve(rawOutput);
  const resolvedProject = safeResolve(PROJECT_ROOT);

  // Normalize to forward slashes for cross-platform comparison.
  const normRaw = resolvedRaw.toLowerCase().replace(/\\/g, "/");
  const normProject = resolvedProject.toLowerCase().replace(/\\/g, "/");

  const projectPrefix = normProject.endsWith("/") ? normProject : normProject + "/";

  if (
    normRaw === normProject ||
    normRaw.startsWith(projectPrefix)
  ) {
    fatal(
      `SECURITY: The raw output path resolves inside the project tree.\n` +
        `  Raw output path: ${resolvedRaw}\n` +
        `  Project root:    ${resolvedProject}\n` +
        `\n` +
        `Raw API captures may contain real player/clan tags, names, and identifying data.\n` +
        `They must be stored OUTSIDE the project tree so they can never be accidentally committed.\n` +
        `\n` +
        `Provide a path outside the project root. Example:\n` +
        `  --raw-output "C:\\Users\\<you>\\clashhq-raw-captures"`
    );
  }

  // Additional symlink check: verify no ancestor of the resolved path is a
  // symlink pointing inside the project tree.
  let check = path.dirname(resolvedRaw);
  while (check !== path.dirname(check)) {
    if (fs.existsSync(check)) {
      const lstat = fs.lstatSync(check);
      if (lstat.isSymbolicLink()) {
        const linkTarget = safeResolve(fs.readlinkSync(check));
        const normTarget = linkTarget.toLowerCase().replace(/\\/g, "/");
        if (normTarget === normProject || normTarget.startsWith(projectPrefix)) {
          fatal(
            `SECURITY: An ancestor directory of the raw output path is a symlink\n` +
              `that resolves inside the project tree.\n` +
              `  Symlink: ${check}\n` +
              `  Resolves to: ${linkTarget}\n` +
              `  Project root: ${resolvedProject}`
          );
        }
      }
    }
    check = path.dirname(check);
  }

  return resolvedRaw;
}

// ---------------------------------------------------------------------------
// Token input — never via argument; stdin/console only; never logged
// ---------------------------------------------------------------------------

/**
 * Reads token from an input stream without echoing characters when in TTY raw mode.
 * In non-TTY environments (or tests), falls back to readline without echoing to stdout.
 */
export async function readTokenFromStream(
  input: NodeJS.ReadableStream & { isTTY?: boolean; setRawMode?: (mode: boolean) => void },
  output: NodeJS.WritableStream
): Promise<string> {
  // If the stream supports TTY raw mode, read character-by-character without echoing
  if (input.isTTY && typeof input.setRawMode === "function") {
    return new Promise((resolve, reject) => {
      let buf = "";
      try {
        if (typeof input.setRawMode === "function") {
          input.setRawMode(true);
        }
      } catch (err) {
        reject(err);
        return;
      }
      if (typeof (input as any).resume === "function") {
        (input as any).resume();
      }
      if (typeof (input as any).setEncoding === "function") {
        (input as any).setEncoding("utf-8");
      }

      function onData(chunk: Buffer | string) {
        const str = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
        for (const ch of str) {
          if (ch === "\u0003") {
            // Ctrl+C / SIGINT
            cleanup();
            reject(new Error("Input aborted by user (Ctrl+C)."));
            return;
          }
          if (ch === "\u0004") {
            // Ctrl+D / EOF
            cleanup();
            reject(new Error("stdin closed before token was entered (EOF)."));
            return;
          }
          if (ch === "\r" || ch === "\n") {
            cleanup();
            output.write("\n");
            const token = buf.trim();
            if (!token || token.length < 10) {
              reject(new Error("Token appears empty or too short (minimum 10 characters)."));
            } else {
              resolve(token);
            }
            return;
          }
          if (ch === "\b" || ch === "\x7f") {
            // Backspace
            if (buf.length > 0) {
              buf = buf.slice(0, -1);
            }
            continue;
          }
          // Accept standard printable characters
          if (ch >= " ") {
            buf += ch;
          }
        }
      }

      function onEnd() {
        cleanup();
        reject(new Error("stdin closed before token was entered (EOF)."));
      }

      function cleanup() {
        input.removeListener("data", onData);
        input.removeListener("end", onEnd);
        try {
          if (typeof input.setRawMode === "function") {
            input.setRawMode(false);
          }
        } catch {
          // ignore cleanup errors
        }
        if (typeof (input as any).pause === "function") {
          (input as any).pause();
        }
      }

      input.on("data", onData);
      input.once("end", onEnd);
    });
  }

  // Non-TTY stream (e.g. piped input or mock stream in unit tests)
  const rl = readline.createInterface({
    input,
    output,
    terminal: false,
  });

  return new Promise((resolve, reject) => {
    let resolved = false;

    rl.on("line", (line) => {
      resolved = true;
      rl.close();
      const token = line.trim();
      if (!token || token.length < 10) {
        reject(new Error("Token appears empty or too short (minimum 10 characters)."));
      } else {
        resolve(token);
      }
    });

    rl.on("error", (err) => {
      resolved = true;
      reject(err);
    });

    rl.on("close", () => {
      if (!resolved) {
        reject(new Error("stdin closed before token was entered."));
      }
    });
  });
}

export async function promptApiToken(): Promise<string> {
  process.stderr.write(
    "\n" +
      "Enter your Clash of Clans API token (from developer.clashofclans.com).\n" +
      "The token will NOT be logged, stored, or shown on screen.\n" +
      "Token: "
  );

  let streamToUse: NodeJS.ReadableStream & { isTTY?: boolean; setRawMode?: (mode: boolean) => void } =
    process.stdin;
  let customStreamToClean: tty.ReadStream | null = null;

  // On Windows or environments where process.stdin is not attached to a TTY (such as cmd.exe npm run scripts),
  // open the active console input directly (CONIN$ or /dev/tty).
  if (!process.stdin.isTTY) {
    try {
      const consoleDevice = process.platform === "win32" ? "\\\\.\\CONIN$" : "/dev/tty";
      const fd = fs.openSync(consoleDevice, "r");
      customStreamToClean = new tty.ReadStream(fd);
      streamToUse = customStreamToClean;
    } catch {
      // Fallback to standard process.stdin if console cannot be directly opened
      streamToUse = process.stdin;
    }
  }

  try {
    const token = await readTokenFromStream(streamToUse, process.stderr);
    return token;
  } finally {
    if (customStreamToClean) {
      try {
        customStreamToClean.destroy();
      } catch {
        // ignore cleanup error
      }
    }
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers — NEVER log the token
// ---------------------------------------------------------------------------

/**
 * Makes a GET request to the Clash of Clans API.
 * The Authorization header is set but NEVER logged or echoed.
 * Error messages are sanitized before being returned.
 */
async function apiGet(
  endpointPath: string,
  token: string
): Promise<{ status: number; body: unknown; rawBody: string }> {
  const url = API_BASE + endpointPath;

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer [REDACTED]`, // Placeholder for log purposes; actual header set below
          Accept: "application/json",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let body: unknown;
          try {
            body = JSON.parse(data);
          } catch {
            body = null;
          }
          resolve({ status: res.statusCode ?? 0, body, rawBody: data });
        });
      }
    );

    // Set the real Authorization header directly on request instance.
    req.setHeader("Authorization", `Bearer ${token}`);

    req.on("error", (err) => {
      // Sanitize error message — ensure the token doesn't appear in it.
      const safeMessage = err.message.replace(token, "[REDACTED_TOKEN]");
      reject(new Error(`API request failed: ${safeMessage}`));
    });

    req.end();
  });
}

// ---------------------------------------------------------------------------
// File writing helpers
// ---------------------------------------------------------------------------

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJsonSafely(filePath: string, data: unknown): void {
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(filePath, json, { encoding: "utf-8" });
}

// ---------------------------------------------------------------------------
// Capture + sanitize workflow
// ---------------------------------------------------------------------------

interface CaptureResult {
  capabilityId: string;
  endpoint: string;
  status: number;
  fieldObserved: boolean;
  rawFile: string | null;
  fixtureFile: string | null;
  rejected: boolean;
  messages: string[];
  error: string | null;
}

async function captureAndSanitize(
  capabilityId: string,
  endpointPath: string,
  token: string,
  rawOutputDir: string,
  fixturesOutputDir: string,
  sanitizerCtx: SanitizationContext,
  salt: Buffer
): Promise<CaptureResult> {
  const result: CaptureResult = {
    capabilityId,
    endpoint: endpointPath,
    status: 0,
    fieldObserved: false,
    rawFile: null,
    fixtureFile: null,
    rejected: false,
    messages: [],
    error: null,
  };

  try {
    // 1. Make API call.
    process.stderr.write(`  Fetching ${capabilityId} (${endpointPath})...\n`);
    const { status, body, rawBody } = await apiGet(endpointPath, token);
    result.status = status;

    if (status !== 200) {
      result.error = `HTTP ${status} — response not recorded (may be private, unavailable, or wrong IP).`;
      // Write the raw error body outside the project (useful for debugging).
      const safeBody = typeof body === "object" && body !== null ? body : { raw: rawBody };
      const rawFile = path.join(rawOutputDir, `${capabilityId}-error-${status}.json`);
      writeJsonSafely(rawFile, safeBody);
      result.rawFile = rawFile;
      return result;
    }

    // 2. Write raw response outside the project tree.
    const rawFile = path.join(rawOutputDir, `${capabilityId}-raw.json`);
    writeJsonSafely(rawFile, body);
    result.rawFile = rawFile;
    result.fieldObserved = true;

    // 3. Sanitize.
    const sanitizeResult = sanitizeFixture(
      body,
      { salt, rejectOnUnknownSensitiveField: true },
      sanitizerCtx
    );
    result.rejected = sanitizeResult.rejected;
    result.messages = sanitizeResult.messages;

    if (sanitizeResult.rejected) {
      result.error = `Sanitizer rejected this fixture. See messages above. Raw file saved at: ${rawFile}`;
      return result;
    }

    // 4. Write sanitized fixture inside the project tree.
    const fixtureFile = path.join(fixturesOutputDir, `${capabilityId}.json`);
    writeJsonSafely(fixtureFile, sanitizeResult.sanitized);
    result.fixtureFile = fixtureFile;
    process.stderr.write(`    ✓ Sanitized fixture written: ${fixtureFile}\n`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Sanitize in case the token appears in the error message.
    result.error = msg.includes("[REDACTED_TOKEN]") ? msg : `Request error (details sanitized)`;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs();

  // 1. Enforce raw output path is outside the project.
  const resolvedRawOutput = enforceRawOutputOutsideProject(args.rawOutput);

  // 2. Normalize and validate the provided tags BEFORE touching disk.
  const clanTag = normalizeTag(args.clanTag);
  if (!TAG_VALIDATION_REGEX.test(clanTag)) {
    fatal(
      `The provided clan tag "${args.clanTag}" does not pass tag validation after normalisation.\n` +
        `Normalized: "${clanTag}"\n` +
        `Expected format: # followed by 3–9 characters from [0289PYLQGRJCUV]`
    );
  }

  let playerTag: string | null = null;
  if (args.playerTag) {
    playerTag = normalizeTag(args.playerTag);
    if (!TAG_VALIDATION_REGEX.test(playerTag)) {
      fatal(
        `The provided player tag "${args.playerTag}" does not pass tag validation.\n` +
          `Normalized: "${playerTag}"`
      );
    }
  }

  process.stderr.write(`Raw output directory (outside project): ${resolvedRawOutput}\n`);

  // 3. Ensure directories exist.
  ensureDir(resolvedRawOutput);
  const fixturesDir = safeResolve(args.fixturesOutput);

  // Validate that fixtures directory is inside the project tree to prevent accidental deletion or leakage elsewhere.
  const resolvedProject = safeResolve(PROJECT_ROOT);
  const normFixtures = fixturesDir.toLowerCase().replace(/\\/g, "/");
  const normProject = resolvedProject.toLowerCase().replace(/\\/g, "/");
  const projectPrefix = normProject.endsWith("/") ? normProject : normProject + "/";
  if (!normFixtures.startsWith(projectPrefix)) {
    fatal(
      `SECURITY: The fixtures output path must resolve inside the project tree.\n` +
        `  Fixtures output: ${fixturesDir}\n` +
        `  Project root:    ${resolvedProject}`
    );
  }

  ensureDir(fixturesDir);
  process.stderr.write(`Fixtures output directory (inside project): ${fixturesDir}\n`);

  // Stale fixture protection: clean previous fixture files in output directory so a partial or failed run cannot leave stale fixtures.
  const knownFixtureFiles = [
    "clan-info.json",
    "clan-members.json",
    "current-war.json",
    "war-log.json",
    "cwl-league-group.json",
    "cwl-war.json",
    "raid-seasons.json",
    "player-profile.json",
    "capture-manifest.json",
  ];
  for (const file of knownFixtureFiles) {
    const p = path.join(fixturesDir, file);
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch {
        // ignore if cannot unlink
      }
    }
  }

  // 4. Prompt for API token — via stdin; never logged.
  const token = await promptApiToken();
  process.stderr.write("\n(Token received — proceeding with capture)\n\n");

  // 5. Per-run salt for the sanitizer (deterministic within this run, not persisted).
  const salt = crypto.randomBytes(32);

  // 6. Shared sanitization context — same tag → same synthetic tag across all fixtures.
  const sanitizerCtx = createContext();

  // 7. Encode clan tag for URL (# → %23).
  const encodedClanTag = clanTag.replace("#", "%23");
  const encodedPlayerTag = playerTag ? playerTag.replace("#", "%23") : null;

  // 8. Capture each capability endpoint.
  // Only capture endpoints specified in spec §4 and §12.
  // Order follows the Phase 0 capture list from spec §10.
  const captures: Array<{ id: string; path: string; skip?: string }> = [
    { id: "clan-info", path: `/clans/${encodedClanTag}` },
    { id: "clan-members", path: `/clans/${encodedClanTag}/members` },
    { id: "current-war", path: `/clans/${encodedClanTag}/currentwar` },
    { id: "war-log", path: `/clans/${encodedClanTag}/warlog` },
    {
      id: "cwl-league-group",
      path: `/clans/${encodedClanTag}/currentwar/leaguegroup`,
    },
    ...(encodedPlayerTag
      ? [{ id: "player-profile", path: `/players/${encodedPlayerTag}` }]
      : [
          {
            id: "player-profile",
            path: "",
            skip: "No --player-tag provided. Skipping player profile capture.",
          },
        ]),
  ];

  // Note: raid-seasons and cwl-war require additional context (war tag from cwl-league-group).
  // These are captured in a second pass if the first pass succeeds.

  const results: CaptureResult[] = [];

  for (const capture of captures) {
    if (capture.skip) {
      process.stderr.write(`  SKIP ${capture.id}: ${capture.skip}\n`);
      results.push({
        capabilityId: capture.id,
        endpoint: capture.path,
        status: 0,
        fieldObserved: false,
        rawFile: null,
        fixtureFile: null,
        rejected: false,
        messages: [capture.skip],
        error: capture.skip,
      });
      continue;
    }

    const r = await captureAndSanitize(
      capture.id,
      capture.path,
      token,
      resolvedRawOutput,
      fixturesDir,
      sanitizerCtx,
      salt
    );
    results.push(r);

    // Brief delay to respect rate limits.
    await sleep(300);
  }

  // Second pass: raid seasons.
  const raidResult = await captureAndSanitize(
    "raid-seasons",
    `/clans/${encodedClanTag}/capitalraidseasons`,
    token,
    resolvedRawOutput,
    fixturesDir,
    sanitizerCtx,
    salt
  );
  results.push(raidResult);
  await sleep(300);

  // Second pass: CWL war — if cwl-league-group returned round war tags, fetch the first one.
  const cwlGroupResult = results.find((r) => r.capabilityId === "cwl-league-group");
  if (cwlGroupResult?.fixtureFile && !cwlGroupResult.rejected) {
    try {
      const fixtureData = JSON.parse(
        fs.readFileSync(cwlGroupResult.fixtureFile, "utf-8")
      ) as Record<string, unknown>;
      const rounds = (fixtureData as any)?.rounds as Array<{ warTags: string[] }> | undefined;
      const firstRound = rounds?.[0];
      if (firstRound && firstRound.warTags && firstRound.warTags.length > 0) {
        // The fixture contains synthetic war tags — we need to get the REAL war tag
        // from the raw file to make the actual API call.
        process.stderr.write(
          `  NOTE: To capture CWL war detail, re-run with --war-tag <realWarTag> from the raw CWL league group file.\n` +
            `  Raw file location: ${cwlGroupResult.rawFile}\n`
        );
      }
    } catch {
      // Fixture unreadable — skip.
    }
  }

  // 9. Write a capture manifest (no sensitive data — sanitized tags and capability IDs only).
  const manifest = {
    capturedAt: new Date().toISOString(),
    clanTag: sanitizerCtx.tagMap.has(clanTag) ? (sanitizerCtx.tagMap.get(clanTag) ?? "(unmapped)") : "(unmapped)",
    playerTag: playerTag
      ? (sanitizerCtx.tagMap.has(playerTag) ? (sanitizerCtx.tagMap.get(playerTag) ?? "(unmapped)") : "(unmapped)")
      : null,
    results: results.map((r) => {
      let outcome: "success" | "partial" | "failed" | "skipped";
      if (!r.status && r.messages.some((m) => m.startsWith("SKIP") || m.includes("Skipping"))) {
        outcome = "skipped";
      } else if (r.rejected || r.status >= 400 || r.status === 0) {
        outcome = "failed";
      } else if (r.fieldObserved && r.fixtureFile !== null) {
        outcome = "success";
      } else {
        outcome = "partial";
      }

      // Sanitize endpoint: replace the real (encoded) clan/player tag with synthetic ones.
      // The encoded tag is e.g. %232Q9JLL2J9 (real) → must become %23CVVJPJ8J (synthetic).
      let safeEndpoint = r.endpoint;
      if (clanTag) {
        const encodedReal = clanTag.replace("#", "%23");
        const syntheticClanTag = sanitizerCtx.tagMap.get(clanTag) ?? null;
        if (syntheticClanTag) {
          const encodedSynthetic = syntheticClanTag.replace("#", "%23");
          safeEndpoint = safeEndpoint.split(encodedReal).join(encodedSynthetic);
        }
      }
      if (playerTag) {
        const encodedRealPlayer = playerTag.replace("#", "%23");
        const syntheticPlayerTag = sanitizerCtx.tagMap.get(playerTag) ?? null;
        if (syntheticPlayerTag) {
          const encodedSyntheticPlayer = syntheticPlayerTag.replace("#", "%23");
          safeEndpoint = safeEndpoint.split(encodedRealPlayer).join(encodedSyntheticPlayer);
        }
      }

      return {
        capabilityId: r.capabilityId,
        endpoint: safeEndpoint,
        httpStatus: r.status,
        outcome,
        fieldObserved: r.fieldObserved,
        fixtureWritten: r.fixtureFile !== null,
        rejected: r.rejected,
        messageCount: r.messages.length,
        error: r.error,
      };
    }),
  };
  const manifestFile = path.join(fixturesDir, "capture-manifest.json");
  writeJsonSafely(manifestFile, manifest);
  process.stderr.write(`\nCapture manifest written to: ${manifestFile}\n`);

  // 10. Summary — printed to stdout (safe; no sensitive data).
  console.log("\n=== Phase 0 Capture Summary ===\n");
  for (const r of results) {
    const icon = r.rejected ? "✗ REJECTED" : r.fieldObserved ? "✓" : "— SKIPPED";
    console.log(
      `${icon} ${r.capabilityId}: HTTP ${r.status || "—"} | fixture: ${r.fixtureFile ? "written" : "none"}`
    );
    for (const msg of r.messages) {
      console.log(`   ${msg}`);
    }
    if (r.error) console.log(`   ERROR: ${r.error}`);
  }

  const observed = results.filter((r) => r.fieldObserved).length;
  const rejected = results.filter((r) => r.rejected).length;
  console.log(
    `\nTotal: ${results.length} capabilities attempted, ${observed} field_observed, ${rejected} rejected by sanitizer.`
  );
  console.log(
    "\nNext steps:\n" +
      "  1. Inspect every file in the fixtures/ directory.\n" +
      "  2. Confirm no real tag, name, IP, or key appears in any file.\n" +
      "  3. Update shared/capabilities.json status fields based on the captures.\n" +
      "  4. Run: npx vitest run tests/registry-consistency.test.ts\n" +
      "  5. Provide Phase 0 gate approval in docs/PROGRESS.md.\n"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function fatal(message: string): never {
  process.stderr.write(`\nFATAL: ${message}\n\n`);
  process.exit(1);
}

// Only invoke main when executed directly as entrypoint.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    // Ensure no token leaks through the error handler.
    process.stderr.write(`\nFATAL (unhandled): ${message.slice(0, 200)}\n`);
    process.exit(1);
  });
}
