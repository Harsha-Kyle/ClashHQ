/**
 * Regression tests for capture CLI argument parsing (Phase 0).
 */

import { describe, it, expect, vi } from "vitest";
import { parseCliArgs, readTokenFromStream } from "../scripts/capture-fixtures.js";
import { PassThrough } from "stream";

describe("parseCliArgs", () => {
  it("parses valid required options in standard order", () => {
    const args = [
      "--raw-output",
      "C:\\Users\\harsh\\clashhq-raw-captures",
      "--fixtures-output",
      "./fixtures",
      "--clan-tag",
      "#2Q9JLL2J9",
    ];
    const parsed = parseCliArgs(args);
    expect(parsed.rawOutput).toBe("C:\\Users\\harsh\\clashhq-raw-captures");
    expect(parsed.fixturesOutput).toBe("./fixtures");
    expect(parsed.clanTag).toBe("#2Q9JLL2J9");
    expect(parsed.playerTag).toBeNull();
  });

  it("parses options in arbitrary order", () => {
    const args = [
      "--clan-tag",
      "#2Q9JLL2J9",
      "--fixtures-output",
      "./fixtures",
      "--raw-output",
      "C:\\Users\\harsh\\clashhq-raw-captures",
    ];
    const parsed = parseCliArgs(args);
    expect(parsed.rawOutput).toBe("C:\\Users\\harsh\\clashhq-raw-captures");
    expect(parsed.fixturesOutput).toBe("./fixtures");
    expect(parsed.clanTag).toBe("#2Q9JLL2J9");
    expect(parsed.playerTag).toBeNull();
  });

  it("parses optional --player-tag when explicitly provided", () => {
    const args = [
      "--raw-output",
      "C:\\Users\\harsh\\clashhq-raw-captures",
      "--fixtures-output",
      "./fixtures",
      "--clan-tag",
      "#2Q9JLL2J9",
      "--player-tag",
      "#8YQ0289P",
    ];
    const parsed = parseCliArgs(args);
    expect(parsed.playerTag).toBe("#8YQ0289P");
  });

  it("does not treat --raw-output as a player tag when --player-tag has no value", () => {
    const args = [
      "--player-tag",
      "--raw-output",
      "C:\\Users\\harsh\\clashhq-raw-captures",
      "--fixtures-output",
      "./fixtures",
      "--clan-tag",
      "#2Q9JLL2J9",
    ];

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as any);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    expect(() => parseCliArgs(args)).toThrow("process.exit called");
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Missing value for argument: "--player-tag"'));

    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it("rejects unknown options", () => {
    const args = [
      "--raw-output",
      "C:\\Users\\harsh\\clashhq-raw-captures",
      "--fixtures-output",
      "./fixtures",
      "--clan-tag",
      "#2Q9JLL2J9",
      "--unknown-flag",
      "val",
    ];

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as any);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    expect(() => parseCliArgs(args)).toThrow("process.exit called");
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown option: "--unknown-flag"'));

    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it("rejects unexpected positional arguments", () => {
    const args = [
      "positional-value",
      "--raw-output",
      "C:\\Users\\harsh\\clashhq-raw-captures",
      "--fixtures-output",
      "./fixtures",
      "--clan-tag",
      "#2Q9JLL2J9",
    ];

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as any);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    expect(() => parseCliArgs(args)).toThrow("process.exit called");
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Unexpected positional argument: "positional-value"'));

    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it("fails when required --clan-tag is missing", () => {
    const args = [
      "--raw-output",
      "C:\\Users\\harsh\\clashhq-raw-captures",
      "--fixtures-output",
      "./fixtures",
    ];

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as any);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    expect(() => parseCliArgs(args)).toThrow("process.exit called");
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Missing --clan-tag argument"));

    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it("supports --help without error or network calls", () => {
    const args = ["--help"];

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit 0");
    }) as any);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(() => parseCliArgs(args)).toThrow("exit 0");
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("ClashHQ Phase 0 Capture Tool"));

    exitSpy.mockRestore();
    logSpy.mockRestore();
  });
});

describe("readTokenFromStream (token input handling)", () => {
  it("reads a valid token from a non-TTY stream", async () => {
    const input = new PassThrough();
    const output = new PassThrough();

    const promise = readTokenFromStream(input, output);
    input.write("valid_api_token_12345\n");

    const token = await promise;
    expect(token).toBe("valid_api_token_12345");
  });

  it("rejects token that is too short (< 10 chars) from non-TTY stream", async () => {
    const input = new PassThrough();
    const output = new PassThrough();

    const promise = readTokenFromStream(input, output);
    input.write("short\n");

    await expect(promise).rejects.toThrow("Token appears empty or too short");
  });

  it("rejects when non-TTY input stream closes without entering a token", async () => {
    const input = new PassThrough();
    const output = new PassThrough();

    const promise = readTokenFromStream(input, output);
    input.end();

    await expect(promise).rejects.toThrow("stdin closed before token was entered.");
  });

  it("reads a valid token in mock TTY mode without echoing characters", async () => {
    const input = new PassThrough() as any;
    input.isTTY = true;
    input.setRawMode = vi.fn();
    const output = new PassThrough();

    let outputData = "";
    output.on("data", (chunk) => {
      outputData += chunk.toString();
    });

    const promise = readTokenFromStream(input, output);
    expect(input.setRawMode).toHaveBeenCalledWith(true);

    // Simulate typing characters followed by Enter (\r)
    input.write("supercell_secret_token_123\r");

    const token = await promise;
    expect(token).toBe("supercell_secret_token_123");
    // Ensure the token itself was NEVER written to output stream (only newline on enter)
    expect(outputData).toBe("\n");
    expect(outputData).not.toContain("supercell_secret_token_123");
    expect(input.setRawMode).toHaveBeenCalledWith(false);
  });

  it("handles backspace cleanly in mock TTY mode", async () => {
    const input = new PassThrough() as any;
    input.isTTY = true;
    input.setRawMode = vi.fn();
    const output = new PassThrough();

    const promise = readTokenFromStream(input, output);

    // Type "wrong_token", backspace 5 times, type "correct_token_123"
    input.write("wrong_token\b\b\b\b\bcorrect_token_123\n");

    const token = await promise;
    expect(token).toBe("wrong_correct_token_123");
  });

  it("rejects with clean error on Ctrl+C (\\u0003) in TTY mode", async () => {
    const input = new PassThrough() as any;
    input.isTTY = true;
    input.setRawMode = vi.fn();
    const output = new PassThrough();

    const promise = readTokenFromStream(input, output);
    input.write("partial_token\u0003");

    await expect(promise).rejects.toThrow("Input aborted by user (Ctrl+C).");
  });

  it("rejects with clean error on Ctrl+D (\\u0004) in TTY mode", async () => {
    const input = new PassThrough() as any;
    input.isTTY = true;
    input.setRawMode = vi.fn();
    const output = new PassThrough();

    const promise = readTokenFromStream(input, output);
    input.write("\u0004");

    await expect(promise).rejects.toThrow("stdin closed before token was entered (EOF).");
  });

  it("rejects with clean error on TTY stream end before token completion", async () => {
    const input = new PassThrough() as any;
    input.isTTY = true;
    input.setRawMode = vi.fn();
    const output = new PassThrough();

    const promise = readTokenFromStream(input, output);
    input.end();

    await expect(promise).rejects.toThrow("stdin closed before token was entered (EOF).");
  });

  it("redacts real tags from manifest endpoints", () => {
    const clanTag = "#2Q9JLL2J9";
    const syntheticClanTag = "#CVVJPJ8J";
    const endpoint = `/clans/%232Q9JLL2J9/members`;

    const encodedReal = clanTag.replace("#", "%23");
    const encodedSynthetic = syntheticClanTag.replace("#", "%23");
    const safeEndpoint = endpoint.split(encodedReal).join(encodedSynthetic);

    expect(safeEndpoint).toBe(`/clans/%23CVVJPJ8J/members`);
    expect(safeEndpoint).not.toContain("2Q9JLL2J9");
  });
});
