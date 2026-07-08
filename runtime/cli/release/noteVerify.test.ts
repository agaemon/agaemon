import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { formatReleaseNoteVerifyCliOutput } from "./noteVerify.js";

import type { ReleaseNoteVerifyCliReport } from "./noteVerify.js";

type ReleaseNoteVerifyCliModule = typeof import("./noteVerify.js") & {
  isReleaseNoteVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseReleaseNoteVerifyCliArgs?: (argv: readonly string[]) => {
    releasePath: string;
    manifestPath?: string | undefined;
    format: "json" | "summary";
  };
  runReleaseNoteVerifyCli?: (options?: {
    argv?: readonly string[];
    writeOutput?: (output: string) => void;
    setExitCode?: (code: number) => void;
    readText?: (path: string) => Promise<string>;
    verifyNote?: (markdown: string, options?: {
      manifestContents?: string | undefined;
    }) => { passed: boolean; failures: string[] };
  }) => Promise<void>;
};

const REPORT: ReleaseNoteVerifyCliReport = {
  release: "docs/releases/base-sepolia-2026-06-25-0123456.md",
  manifest: "deployments/base-sepolia/latest.json",
  passed: false,
  failures: [
    "manifest sha256 does not match current manifest",
    "readiness run URL is invalid",
  ],
};

describe("formatReleaseNoteVerifyCliOutput", () => {
  it("keeps JSON release note verification output available for automation", () => {
    expect(formatReleaseNoteVerifyCliOutput(REPORT, "json")).toBe(JSON.stringify(REPORT, null, 2));
  });

  it("renders a readable release note verification summary when requested", () => {
    expect(formatReleaseNoteVerifyCliOutput(REPORT, "summary")).toBe([
      "Base Sepolia release note verification",
      "release: docs/releases/base-sepolia-2026-06-25-0123456.md",
      "manifest: deployments/base-sepolia/latest.json",
      "passed: false",
      "failures: 2",
      "- manifest sha256 does not match current manifest",
      "- readiness run URL is invalid",
    ].join("\n"));
  });

  it("rejects malformed release note verification reports before output formatting", () => {
    expect(() => formatReleaseNoteVerifyCliOutput(null as never, "json")).toThrow(
      "Release note verification report must be an object",
    );
  });

  it("rejects unsupported release note verification output formats", () => {
    expect(() => formatReleaseNoteVerifyCliOutput(REPORT, "text" as never)).toThrow(
      "Release note verification output format must be json or summary",
    );
  });

  it("rejects malformed release note verification report paths", () => {
    expect(() => formatReleaseNoteVerifyCliOutput({ ...REPORT, release: " " }, "summary")).toThrow(
      "Release note verification report release must not be empty",
    );
    expect(() => formatReleaseNoteVerifyCliOutput({ ...REPORT, manifest: 7 } as never, "summary")).toThrow(
      "Release note verification report manifest must be a string",
    );
  });

  it("rejects malformed release note verification report states and failures", () => {
    expect(() => formatReleaseNoteVerifyCliOutput({ ...REPORT, passed: "false" } as never, "json")).toThrow(
      "Release note verification report passed must be a boolean",
    );
    expect(() => formatReleaseNoteVerifyCliOutput({ ...REPORT, failures: "failure" } as never, "summary")).toThrow(
      "Release note verification report failures must be an array",
    );
    expect(() => formatReleaseNoteVerifyCliOutput({ ...REPORT, failures: [""] }, "summary")).toThrow(
      "Release note verification report failure 0 must not be empty",
    );
  });
});

describe("isReleaseNoteVerifyDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./noteVerify.js") as ReleaseNoteVerifyCliModule;
    const scriptPath = resolve("runtime/cli/release/noteVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isReleaseNoteVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isReleaseNoteVerifyDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isReleaseNoteVerifyDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/release/note.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./noteVerify.js") as ReleaseNoteVerifyCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/release/noteVerify.ts")).href;

    expect(() => module.isReleaseNoteVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(() => module.isReleaseNoteVerifyDirectRun?.(
      moduleUrl,
      ["node", 123] as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseReleaseNoteVerifyCliArgs", () => {
  it("requires a release note path", async () => {
    const module = await import("./noteVerify.js") as ReleaseNoteVerifyCliModule;

    expect(() => module.parseReleaseNoteVerifyCliArgs?.([])).toThrow("--release is required");
  });

  it("parses split and equals-form release note verification flags", async () => {
    const module = await import("./noteVerify.js") as ReleaseNoteVerifyCliModule;

    expect(module.parseReleaseNoteVerifyCliArgs?.([
      "--release",
      "docs/releases/custom.md",
      "--manifest=deployments/base-sepolia/custom.json",
      "--format= summary ",
    ])).toEqual({
      releasePath: "docs/releases/custom.md",
      manifestPath: "deployments/base-sepolia/custom.json",
      format: "summary",
    });
  });

  it("rejects duplicate, missing, unsupported, and invalid format arguments", async () => {
    const module = await import("./noteVerify.js") as ReleaseNoteVerifyCliModule;

    expect(() => module.parseReleaseNoteVerifyCliArgs?.(["--release", "a.md", "--release", "b.md"])).toThrow(
      "Duplicate argument: --release",
    );
    expect(() => module.parseReleaseNoteVerifyCliArgs?.(["--manifest"])).toThrow("--manifest requires a value");
    expect(() => module.parseReleaseNoteVerifyCliArgs?.(["--release", "a.md", "--format", "text"])).toThrow(
      "--format must be json or summary",
    );
    expect(() => module.parseReleaseNoteVerifyCliArgs?.(["--release", "a.md", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runReleaseNoteVerifyCli", () => {
  async function runWithReadMarkdown(markdown: unknown, calls: string[] = []): Promise<void> {
    const module = await import("./noteVerify.js") as ReleaseNoteVerifyCliModule;

    await module.runReleaseNoteVerifyCli?.({
      argv: ["--release", "docs/releases/base-sepolia-2026-06-25-0123456.md"],
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      readText: async () => markdown as string,
      verifyNote: () => {
        calls.push("verify");
        return { passed: true, failures: [] };
      },
    });
  }

  async function runWithInjectedVerification(
    verification: unknown,
    calls: string[] = [],
  ): Promise<void> {
    const module = await import("./noteVerify.js") as ReleaseNoteVerifyCliModule;

    await module.runReleaseNoteVerifyCli?.({
      argv: ["--release", "docs/releases/base-sepolia-2026-06-25-0123456.md"],
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      readText: async () => "markdown",
      verifyNote: () => verification as { passed: boolean; failures: string[] },
    });
  }

  it("verifies injected release notes and writes formatted output", async () => {
    const module = await import("./noteVerify.js") as ReleaseNoteVerifyCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runReleaseNoteVerifyCli?.({
      argv: [
        "--release",
        "docs/releases/base-sepolia-2026-06-25-0123456.md",
        "--manifest",
        "deployments/base-sepolia/latest.json",
      ],
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path.endsWith(".md") ? "markdown" : "manifest";
      },
      verifyNote: (markdown, options) => {
        calls.push(`verify:${markdown}:${options?.manifestContents ?? ""}`);
        return { passed: true, failures: [] };
      },
    });

    expect(outputs).toEqual([formatReleaseNoteVerifyCliOutput({
      release: "docs/releases/base-sepolia-2026-06-25-0123456.md",
      manifest: "deployments/base-sepolia/latest.json",
      passed: true,
      failures: [],
    }, "json")]);
    expect(calls).toEqual([
      "read:docs/releases/base-sepolia-2026-06-25-0123456.md",
      "read:deployments/base-sepolia/latest.json",
      "verify:markdown:manifest",
    ]);
  });

  it("sets exit code after failed injected verification output", async () => {
    const module = await import("./noteVerify.js") as ReleaseNoteVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runReleaseNoteVerifyCli?.({
      argv: [
        "--release",
        "docs/releases/base-sepolia-2026-06-25-0123456.md",
        "--manifest",
        "deployments/base-sepolia/latest.json",
        "--format",
        "summary",
      ],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "text",
      verifyNote: () => ({ passed: false, failures: REPORT.failures }),
    });

    expect(outputs).toEqual([formatReleaseNoteVerifyCliOutput(REPORT, "summary")]);
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed release note markdown before verifier output or exit-code mutation", async () => {
    const calls: string[] = [];

    await expect(runWithReadMarkdown(7, calls)).rejects.toThrow(
      "Release note markdown must be a string",
    );
    expect(calls).toEqual([]);
  });

  it("rejects empty release note markdown before verifier output or exit-code mutation", async () => {
    const calls: string[] = [];

    await expect(runWithReadMarkdown(" ", calls)).rejects.toThrow(
      "Release note markdown must not be empty",
    );
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected release note verification reports before output or exit-code mutation", async () => {
    const calls: string[] = [];

    await expect(runWithInjectedVerification(null, calls)).rejects.toThrow(
      "Release note verification report must be an object",
    );
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected release note verification failures before output or exit-code mutation", async () => {
    const calls: string[] = [];

    await expect(runWithInjectedVerification({ passed: false, failures: [7] }, calls)).rejects.toThrow(
      "Release note verification report failure 0 must be a string",
    );
    expect(calls).toEqual([]);
  });

  it("rejects malformed arguments before release note reads", async () => {
    const module = await import("./noteVerify.js") as ReleaseNoteVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runReleaseNoteVerifyCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
