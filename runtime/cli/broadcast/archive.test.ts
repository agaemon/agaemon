import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type BroadcastArchiveCliModule = typeof import("./archive.js") & {
  isBroadcastArchiveDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastArchiveCliArgs?: (argv: readonly string[]) => ArchiveCliArgs;
  runBroadcastArchiveCli?: (options?: ArchiveRunnerOptions) => Promise<void>;
};

interface ArchiveCliArgs {
  reportPath: string;
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
  outputPath?: string | undefined;
  generatedAt?: string | undefined;
}

interface ArchiveRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createArchive?: (params: unknown) => BroadcastArchive;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface BroadcastArchive {
  schemaVersion: 1;
  generatedAt: string;
  report: { path: string };
  receipt: { path: string };
  broadcastPackage: { path: string };
  submitResult: { path: string };
  verification: {
    passed: boolean;
    failures: readonly string[];
  };
}

const ARCHIVE_ARGS = [
  "--report",
  "artifacts/report.md",
  "--broadcast-receipt",
  "artifacts/receipt.json",
  "--broadcast-package",
  "artifacts/broadcast-package.json",
  "--submit-result",
  "artifacts/submit-result.json",
] as const;

const ARCHIVE: BroadcastArchive = {
  schemaVersion: 1,
  generatedAt: "2026-07-01T08:00:00.000Z",
  report: { path: "artifacts/report.md" },
  receipt: { path: "artifacts/receipt.json" },
  broadcastPackage: { path: "artifacts/broadcast-package.json" },
  submitResult: { path: "artifacts/submit-result.json" },
  verification: { passed: true, failures: [] },
};

describe("isBroadcastArchiveDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./archive.js") as BroadcastArchiveCliModule;
    const scriptPath = resolve("runtime/cli/broadcast/archive.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastArchiveDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isBroadcastArchiveDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isBroadcastArchiveDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/broadcast/reportVerify.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./archive.js") as BroadcastArchiveCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/broadcast/archive.ts")).href;

    expect(() => module.isBroadcastArchiveDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseBroadcastArchiveCliArgs", () => {
  it("requires report, receipt, package, and submit-result paths", async () => {
    const module = await import("./archive.js") as BroadcastArchiveCliModule;

    expect(() => module.parseBroadcastArchiveCliArgs?.([])).toThrow("--report is required");
    expect(() => module.parseBroadcastArchiveCliArgs?.(["--report", "report.md"])).toThrow(
      "--broadcast-receipt is required",
    );
  });

  it("parses split and equals-form archive flags", async () => {
    const module = await import("./archive.js") as BroadcastArchiveCliModule;

    expect(module.parseBroadcastArchiveCliArgs?.([
      "--report=artifacts/report.md",
      "--broadcast-receipt",
      "artifacts/receipt.json",
      "--broadcast-package=artifacts/broadcast-package.json",
      "--submit-result",
      " artifacts/submit-result.json ",
      "--output=artifacts/archive.json",
      "--generated-at",
      " 2026-07-01T08:00:00.000Z ",
    ])).toEqual({
      reportPath: "artifacts/report.md",
      broadcastReceiptPath: "artifacts/receipt.json",
      broadcastPackagePath: "artifacts/broadcast-package.json",
      submitResultPath: "artifacts/submit-result.json",
      outputPath: "artifacts/archive.json",
      generatedAt: "2026-07-01T08:00:00.000Z",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./archive.js") as BroadcastArchiveCliModule;

    expect(() => module.parseBroadcastArchiveCliArgs?.([
      "--report",
      "a.md",
      "--report",
      "b.md",
    ])).toThrow("Duplicate argument: --report");
    expect(() => module.parseBroadcastArchiveCliArgs?.(["--generated-at"])).toThrow(
      "--generated-at requires a value",
    );
    expect(() => module.parseBroadcastArchiveCliArgs?.(["--report", "a.md", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runBroadcastArchiveCli", () => {
  it("prints archives when no output path is requested", async () => {
    const module = await import("./archive.js") as BroadcastArchiveCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runBroadcastArchiveCli?.({
      argv: ARCHIVE_ARGS,
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      createArchive: (params) => {
        calls.push(`archive:${typeof params}`);
        return ARCHIVE;
      },
      writeText: async () => {
        calls.push("write");
      },
    });

    expect(JSON.parse(outputs[0]!)).toEqual(ARCHIVE);
    expect(calls).toEqual([
      "read:artifacts/report.md",
      "read:artifacts/receipt.json",
      "read:artifacts/broadcast-package.json",
      "read:artifacts/submit-result.json",
      "archive:object",
    ]);
  });

  it("writes archives and prints JSON summaries when output is requested", async () => {
    const module = await import("./archive.js") as BroadcastArchiveCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runBroadcastArchiveCli?.({
      argv: [...ARCHIVE_ARGS, "--output", "artifacts/archive.json"],
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      createArchive: () => ARCHIVE,
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    expect(JSON.parse(outputs[0]!)).toEqual({
      output: "artifacts/archive.json",
      report: "artifacts/report.md",
      receipt: "artifacts/receipt.json",
      broadcastPackage: "artifacts/broadcast-package.json",
      submitResult: "artifacts/submit-result.json",
      passed: true,
      generatedAt: "2026-07-01T08:00:00.000Z",
    });
    expect(calls).toContain("mkdir:artifacts");
    expect(calls).toContain(`write:artifacts/archive.json:${JSON.stringify(ARCHIVE, null, 2)}\n`);
  });

  it("writes failed archive output before setting exit code", async () => {
    const module = await import("./archive.js") as BroadcastArchiveCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];

    await module.runBroadcastArchiveCli?.({
      argv: [...ARCHIVE_ARGS, "--output", "artifacts/archive.json"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      createArchive: () => ({
        ...ARCHIVE,
        verification: { passed: false, failures: ["archive failed"] },
      }),
      mkdirp: async () => {
        calls.push("mkdir");
      },
      writeText: async () => {
        calls.push("write");
      },
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ passed: false });
    expect(exitCodes).toEqual([1]);
    expect(calls).toContain("write");
  });

  it("rejects malformed injected archives before writes, output, or exit code mutation", async () => {
    const module = await import("./archive.js") as BroadcastArchiveCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];
    const exitCodes: number[] = [];

    await expect(module.runBroadcastArchiveCli?.({
      argv: [...ARCHIVE_ARGS, "--output", "artifacts/archive.json"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      createArchive: () => ({
        ...ARCHIVE,
        verification: { passed: true, failures: "not-failures" },
      } as unknown as BroadcastArchive),
      mkdirp: async () => {
        calls.push("mkdir");
      },
      writeText: async () => {
        calls.push("write");
      },
    })).rejects.toThrow("Broadcast archive manifest verification failures must be an array");

    expect(outputs).toEqual([]);
    expect(calls).toEqual([]);
    expect(exitCodes).toEqual([]);
  });

  it("rejects malformed arguments before reads or archive creation", async () => {
    const module = await import("./archive.js") as BroadcastArchiveCliModule;
    const calls: string[] = [];

    await expect(module.runBroadcastArchiveCli?.({
      argv: ["--unknown"],
      readText: async () => {
        calls.push("read");
        return "";
      },
      createArchive: () => ARCHIVE,
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
