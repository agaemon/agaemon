import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Module = typeof import("./archive.js") & {
  isBroadcastCloseoutFinalizationArchiveDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastCloseoutFinalizationArchiveCliArgs?: (argv: readonly string[]) => Record<string, string>;
  runBroadcastCloseoutFinalizationArchiveCli?: (options?: RunnerOptions) => Promise<void>;
};

interface RunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createArchive?: (params: unknown) => ArchiveResult;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface ArchiveResult {
  generatedAt: string;
  report: { path: string };
  archive: { path: string };
  status: { path: string };
  summary: { path: string };
  finalizationStatus: { path: string };
  verification: { passed: boolean; failures: readonly string[] };
}

const ARGS = [
  "--report", "artifacts/report.md",
  "--archive", "artifacts/archive.json",
  "--status", "artifacts/status.json",
  "--summary", "artifacts/summary.md",
  "--finalization-status", "artifacts/finalization-status.json",
  "--broadcast-receipt", "artifacts/receipt.json",
  "--broadcast-package", "artifacts/package.json",
  "--submit-result", "artifacts/submit.json",
] as const;

const ARCHIVE: ArchiveResult = {
  generatedAt: "2026-07-01T08:00:00.000Z",
  report: { path: "artifacts/report.md" },
  archive: { path: "artifacts/archive.json" },
  status: { path: "artifacts/status.json" },
  summary: { path: "artifacts/summary.md" },
  finalizationStatus: { path: "artifacts/finalization-status.json" },
  verification: { passed: true, failures: [] },
};

describe("finalization archive CLI seams", () => {
  it("detects direct execution and parses strict args", async () => {
    const module = await import("./archive.js") as Module;
    const scriptPath = resolve("runtime/cli/broadcastCloseout/finalizationArchive/archive/archive.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastCloseoutFinalizationArchiveDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.parseBroadcastCloseoutFinalizationArchiveCliArgs?.([
      ...ARGS,
      "--output=artifacts/finalization-archive.json",
      "--generated-at=2026-07-01T08:00:00.000Z",
    ])).toMatchObject({
      generatedAt: "2026-07-01T08:00:00.000Z",
      outputPath: "artifacts/finalization-archive.json",
    });
    expect(() => module.parseBroadcastCloseoutFinalizationArchiveCliArgs?.([])).toThrow("--report is required");
    expect(() => module.parseBroadcastCloseoutFinalizationArchiveCliArgs?.(["--output"])).toThrow(
      "--output requires a value",
    );
    expect(() => module.parseBroadcastCloseoutFinalizationArchiveCliArgs?.([
      ...ARGS,
      "--report", "artifacts/other-report.md",
    ])).toThrow("Duplicate argument: --report");
  });

  it("writes archive summaries through injected dependencies", async () => {
    const module = await import("./archive.js") as Module;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutFinalizationArchiveCli?.({
      argv: [...ARGS, "--output", "artifacts/finalization-archive.json"],
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

    expect(JSON.parse(outputs[0]!)).toMatchObject({ output: "artifacts/finalization-archive.json", passed: true });
    expect(calls.some((call) => call.startsWith("write:artifacts/finalization-archive.json:"))).toBe(true);
  });

  it("rejects malformed arguments before reads", async () => {
    const module = await import("./archive.js") as Module;
    const calls: string[] = [];

    await expect(module.runBroadcastCloseoutFinalizationArchiveCli?.({
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
