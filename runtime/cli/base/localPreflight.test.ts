import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { formatLocalPreflightCliOutput } from "./localPreflight.js";

import type {
  BaseSepoliaLocalPreflightInput,
  BaseSepoliaLocalPreflightReport,
} from "../../base/localPreflight.js";
import type { BaseSepoliaReleaseNoteSource } from "../../release/index.js";
import type { LocalPreflightCliFormat } from "./localPreflight.js";
import type { LocalPreflightCliReport } from "./localPreflight.js";

type LocalPreflightCliModule = typeof import("./localPreflight.js") & {
  isLocalPreflightDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseLocalPreflightCliArgs?: (argv: readonly string[]) => {
    releaseDir: string;
    manifestPath: string;
    envExamplePath: string;
    indexPath: string;
    statusPath: string;
    summaryPath: string;
    outputPath?: string | undefined;
    format: LocalPreflightCliFormat;
  };
  runLocalPreflightCli?: (options?: {
    argv?: readonly string[];
    writeOutput?: (output: string) => void;
    setExitCode?: (code: number) => void;
    readText?: (path: string) => Promise<string>;
    writeText?: (path: string, contents: string) => Promise<void>;
    mkdirp?: (path: string) => Promise<void>;
    readReleaseNotes?: (dir: string) => Promise<BaseSepoliaReleaseNoteSource[]>;
    verifyPreflight?: (input: BaseSepoliaLocalPreflightInput) => BaseSepoliaLocalPreflightReport;
  }) => Promise<void>;
};

const REPORT: LocalPreflightCliReport = {
  releaseDir: "docs/releases",
  manifest: "deployments/base-sepolia/latest.json",
  envExample: ".env.example",
  index: "docs/releases/README.md",
  status: "docs/releases/latest.json",
  summary: "docs/releases/CURRENT.md",
  notes: 1,
  passed: false,
  checks: [
    {
      name: "env-example",
      passed: true,
      failures: [],
    },
    {
      name: "release-summary",
      passed: false,
      failures: ["release summary is stale"],
    },
  ],
};

const PASSED_REPORT: BaseSepoliaLocalPreflightReport = {
  passed: true,
  checks: [
    {
      name: "env-example",
      passed: true,
      failures: [],
    },
  ],
};

const FAILED_PREFLIGHT_REPORT: BaseSepoliaLocalPreflightReport = {
  passed: REPORT.passed,
  checks: REPORT.checks,
};

describe("formatLocalPreflightCliOutput", () => {
  it("keeps JSON as the default local preflight CLI output", () => {
    expect(formatLocalPreflightCliOutput(REPORT, "json")).toBe(JSON.stringify(REPORT, null, 2));
  });

  it("renders a concise local preflight CLI summary when requested", () => {
    expect(formatLocalPreflightCliOutput(REPORT, "summary")).toBe([
      "Base Sepolia local preflight",
      "releaseDir: docs/releases",
      "manifest: deployments/base-sepolia/latest.json",
      "envExample: .env.example",
      "index: docs/releases/README.md",
      "status: docs/releases/latest.json",
      "summary: docs/releases/CURRENT.md",
      "notes: 1",
      "checks: 2",
      "passed: 1",
      "failed: 1",
      "overall: failed",
      "- env-example: passed",
      "- release-summary: failed (release summary is stale)",
    ].join("\n"));
  });

  it("rejects malformed local preflight reports before rendering", () => {
    expect(() => formatLocalPreflightCliOutput(null as unknown as LocalPreflightCliReport, "json")).toThrow(
      "Local preflight report must be an object",
    );
    expect(() => formatLocalPreflightCliOutput({
      ...REPORT,
      releaseDir: "",
    }, "json")).toThrow("Local preflight report releaseDir must not be empty");
    expect(() => formatLocalPreflightCliOutput({
      ...REPORT,
      notes: 1.5,
    }, "json")).toThrow("Local preflight report notes must be a non-negative integer");
  });

  it("rejects unsupported local preflight output formats before rendering", () => {
    expect(() => formatLocalPreflightCliOutput(
      REPORT,
      "text" as unknown as LocalPreflightCliFormat,
    )).toThrow("Local preflight output format must be json or summary");
  });

  it("rejects malformed local preflight check results before rendering", () => {
    expect(() => formatLocalPreflightCliOutput({
      ...REPORT,
      passed: "false" as unknown as boolean,
    }, "json")).toThrow("Local preflight report passed must be a boolean");
    expect(() => formatLocalPreflightCliOutput({
      ...REPORT,
      checks: "checks" as unknown as LocalPreflightCliReport["checks"],
    }, "json")).toThrow("Local preflight report checks must be an array");
    expect(() => formatLocalPreflightCliOutput({
      ...REPORT,
      checks: [{ ...REPORT.checks[0]!, name: "" }],
    }, "summary")).toThrow("Local preflight report check 0 name must not be empty");
    expect(() => formatLocalPreflightCliOutput({
      ...REPORT,
      checks: [{ ...REPORT.checks[0]!, failures: [""] }],
    }, "summary")).toThrow("Local preflight report check 0 failure 0 must not be empty");
  });
});

describe("isLocalPreflightDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./localPreflight.js") as LocalPreflightCliModule;
    const scriptPath = resolve("runtime/cli/base/localPreflight.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isLocalPreflightDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isLocalPreflightDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isLocalPreflightDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/base/readiness.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./localPreflight.js") as LocalPreflightCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/base/localPreflight.ts")).href;

    expect(() => module.isLocalPreflightDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(() => module.isLocalPreflightDirectRun?.(
      moduleUrl,
      ["node", 123] as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseLocalPreflightCliArgs", () => {
  it("uses existing default release evidence paths", async () => {
    const module = await import("./localPreflight.js") as LocalPreflightCliModule;

    expect(module.parseLocalPreflightCliArgs?.([])).toEqual({
      releaseDir: "docs/releases",
      manifestPath: "deployments/base-sepolia/latest.json",
      envExamplePath: ".env.example",
      indexPath: "docs/releases/README.md",
      statusPath: "docs/releases/latest.json",
      summaryPath: "docs/releases/CURRENT.md",
      format: "json",
    });
  });

  it("derives default release evidence paths from custom release dirs", async () => {
    const module = await import("./localPreflight.js") as LocalPreflightCliModule;

    expect(module.parseLocalPreflightCliArgs?.(["--dir", "artifacts/releases"])).toEqual({
      releaseDir: "artifacts/releases",
      manifestPath: "deployments/base-sepolia/latest.json",
      envExamplePath: ".env.example",
      indexPath: "artifacts/releases/README.md",
      statusPath: "artifacts/releases/latest.json",
      summaryPath: "artifacts/releases/CURRENT.md",
      format: "json",
    });
  });

  it("parses split and equals-form local preflight flags", async () => {
    const module = await import("./localPreflight.js") as LocalPreflightCliModule;

    expect(module.parseLocalPreflightCliArgs?.([
      "--dir",
      " artifacts/releases ",
      "--manifest= deployments/base-sepolia/custom.json ",
      "--env-example",
      "fixtures/.env.example",
      "--index=custom-index.md",
      "--status",
      "custom-status.json",
      "--summary=custom-current.md",
      "--output",
      "artifacts/preflight.json",
      "--format= summary ",
    ])).toEqual({
      releaseDir: "artifacts/releases",
      manifestPath: "deployments/base-sepolia/custom.json",
      envExamplePath: "fixtures/.env.example",
      indexPath: "custom-index.md",
      statusPath: "custom-status.json",
      summaryPath: "custom-current.md",
      outputPath: "artifacts/preflight.json",
      format: "summary",
    });
  });

  it("rejects duplicate, missing, unsupported, and invalid format arguments", async () => {
    const module = await import("./localPreflight.js") as LocalPreflightCliModule;

    expect(() => module.parseLocalPreflightCliArgs?.(["--dir", "a", "--dir", "b"])).toThrow(
      "Duplicate argument: --dir",
    );
    expect(() => module.parseLocalPreflightCliArgs?.(["--manifest"])).toThrow("--manifest requires a value");
    expect(() => module.parseLocalPreflightCliArgs?.(["--summary", "--format"])).toThrow(
      "--summary requires a value",
    );
    expect(() => module.parseLocalPreflightCliArgs?.(["--format", "text"])).toThrow(
      "--format must be json or summary",
    );
    expect(() => module.parseLocalPreflightCliArgs?.(["--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runLocalPreflightCli", () => {
  it("formats injected local preflight reports as JSON without reading real release files", async () => {
    const module = await import("./localPreflight.js") as LocalPreflightCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runLocalPreflightCli?.({
      argv: ["--dir", "artifacts/releases"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`text:${path}`);
        return `${path} contents`;
      },
      readReleaseNotes: async (dir) => {
        calls.push(`notes:${dir}`);
        return [{ path: "2026-07-01.md", markdown: "note" }];
      },
      verifyPreflight: (input) => {
        calls.push(`verify:${input.releaseNotes.length}:${input.manifestContents}`);
        return PASSED_REPORT;
      },
    });

    expect(outputs).toEqual([formatLocalPreflightCliOutput({
      releaseDir: "artifacts/releases",
      manifest: "deployments/base-sepolia/latest.json",
      envExample: ".env.example",
      index: "artifacts/releases/README.md",
      status: "artifacts/releases/latest.json",
      summary: "artifacts/releases/CURRENT.md",
      notes: 1,
      ...PASSED_REPORT,
    }, "json")]);
    expect(calls).toEqual([
      "text:.env.example",
      "text:deployments/base-sepolia/latest.json",
      "notes:artifacts/releases",
      "text:artifacts/releases/README.md",
      "text:artifacts/releases/latest.json",
      "text:artifacts/releases/CURRENT.md",
      "verify:1:deployments/base-sepolia/latest.json contents",
    ]);
  });

  it("sets exit code 1 after emitting failed local preflight output", async () => {
    const module = await import("./localPreflight.js") as LocalPreflightCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runLocalPreflightCli?.({
      argv: ["--format", "summary"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async (path) => `${path} contents`,
      readReleaseNotes: async () => [{ path: "2026-07-01.md", markdown: "note" }],
      verifyPreflight: () => FAILED_PREFLIGHT_REPORT,
    });

    expect(outputs).toEqual([formatLocalPreflightCliOutput({
      releaseDir: "docs/releases",
      manifest: "deployments/base-sepolia/latest.json",
      envExample: ".env.example",
      index: "docs/releases/README.md",
      status: "docs/releases/latest.json",
      summary: "docs/releases/CURRENT.md",
      notes: 1,
      ...FAILED_PREFLIGHT_REPORT,
    }, "summary")]);
    expect(exitCodes).toEqual([1]);
  });

  it("writes a JSON artifact when an output path is provided", async () => {
    const module = await import("./localPreflight.js") as LocalPreflightCliModule;
    const outputs: string[] = [];
    const mkdirs: string[] = [];
    const writes: Array<{ path: string; contents: string }> = [];

    await module.runLocalPreflightCli?.({
      argv: ["--format", "summary", "--output", "artifacts/base-sepolia-local-preflight.json"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => `${path} contents`,
      writeText: async (path, contents) => { writes.push({ path, contents }); },
      mkdirp: async (path) => { mkdirs.push(path); },
      readReleaseNotes: async () => [{ path: "2026-07-01.md", markdown: "note" }],
      verifyPreflight: () => PASSED_REPORT,
    });

    const cliReport: LocalPreflightCliReport = {
      releaseDir: "docs/releases",
      manifest: "deployments/base-sepolia/latest.json",
      envExample: ".env.example",
      index: "docs/releases/README.md",
      status: "docs/releases/latest.json",
      summary: "docs/releases/CURRENT.md",
      notes: 1,
      ...PASSED_REPORT,
    };

    expect(outputs).toEqual([formatLocalPreflightCliOutput(cliReport, "summary")]);
    expect(mkdirs).toEqual(["artifacts"]);
    expect(writes).toEqual([
      {
        path: "artifacts/base-sepolia-local-preflight.json",
        contents: `${JSON.stringify(cliReport, null, 2)}\n`,
      },
    ]);
  });

  it("rejects malformed arguments before release file reads", async () => {
    const module = await import("./localPreflight.js") as LocalPreflightCliModule;
    const calls: string[] = [];

    await expect(module.runLocalPreflightCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("text");
        return "";
      },
      readReleaseNotes: async () => {
        calls.push("notes");
        return [];
      },
      verifyPreflight: () => {
        calls.push("verify");
        return PASSED_REPORT;
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed release notes before verifier calls", async () => {
    const module = await import("./localPreflight.js") as LocalPreflightCliModule;
    const calls: string[] = [];

    await expect(module.runLocalPreflightCli?.({
      argv: [],
      writeOutput: () => calls.push("output"),
      readText: async (path) => {
        calls.push(`text:${path}`);
        return `${path} contents`;
      },
      readReleaseNotes: async () => {
        calls.push("notes");
        return [{ path: "", markdown: "note" }];
      },
      verifyPreflight: () => {
        calls.push("verify");
        return PASSED_REPORT;
      },
    })).rejects.toThrow("Local preflight release note path must not be empty");
    expect(calls).toEqual([
      "text:.env.example",
      "text:deployments/base-sepolia/latest.json",
      "notes",
      "text:docs/releases/README.md",
      "text:docs/releases/latest.json",
      "text:docs/releases/CURRENT.md",
    ]);
  });

  it("rejects malformed injected verifier reports before output or exit-code mutation", async () => {
    const module = await import("./localPreflight.js") as LocalPreflightCliModule;
    const calls: string[] = [];

    await expect(module.runLocalPreflightCli?.({
      argv: [],
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      readText: async (path) => {
        calls.push(`text:${path}`);
        return `${path} contents`;
      },
      readReleaseNotes: async () => {
        calls.push("notes");
        return [{ path: "2026-07-01.md", markdown: "note" }];
      },
      verifyPreflight: () => {
        calls.push("verify");
        return { passed: "no", checks: [] } as unknown as BaseSepoliaLocalPreflightReport;
      },
    })).rejects.toThrow("Local preflight report passed must be a boolean");
    expect(calls.at(-1)).toBe("verify");
    expect(calls).not.toContain("output");
    expect(calls).not.toContain("exit");
  });
});
