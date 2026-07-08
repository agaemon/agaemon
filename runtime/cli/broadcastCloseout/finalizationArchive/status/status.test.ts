import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Module = typeof import("./status.js") & {
  isBroadcastCloseoutFinalizationArchiveStatusDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastCloseoutFinalizationArchiveStatusCliArgs?: (argv: readonly string[]) => Record<string, string>;
  runBroadcastCloseoutFinalizationArchiveStatusCli?: (options?: RunnerOptions) => Promise<void>;
};

interface RunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createStatus?: (params: unknown) => StatusResult;
  formatStatus?: (status: StatusResult) => string;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface StatusResult {
  passed: boolean;
}

const ARGS = [
  "--finalization-archive", "artifacts/finalization-archive.json",
  "--report", "artifacts/report.md",
  "--archive", "artifacts/archive.json",
  "--status", "artifacts/status.json",
  "--summary", "artifacts/summary.md",
  "--finalization-status", "artifacts/finalization-status.json",
  "--broadcast-receipt", "artifacts/receipt.json",
  "--broadcast-package", "artifacts/package.json",
  "--submit-result", "artifacts/submit.json",
] as const;

const EQUALS_ARGS = [
  "--finalization-archive=artifacts/finalization-archive.json",
  "--report=artifacts/report.md",
  "--archive=artifacts/archive.json",
  "--status=artifacts/status.json",
  "--summary=artifacts/summary.md",
  "--finalization-status=artifacts/finalization-status.json",
  "--broadcast-receipt=artifacts/receipt.json",
  "--broadcast-package=artifacts/package.json",
  "--submit-result=artifacts/submit.json",
] as const;

describe("finalization archive status CLI seams", () => {
  it("detects direct execution and parses strict args", async () => {
    const module = await import("./status.js") as Module;
    const scriptPath = resolve("runtime/cli/broadcastCloseout/finalizationArchive/status/status.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastCloseoutFinalizationArchiveStatusDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(() => module.isBroadcastCloseoutFinalizationArchiveStatusDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(module.parseBroadcastCloseoutFinalizationArchiveStatusCliArgs?.([
      ...ARGS,
      "--output=artifacts/finalization-archive-status.json",
    ])).toMatchObject({
      finalizationArchivePath: "artifacts/finalization-archive.json",
      outputPath: "artifacts/finalization-archive-status.json",
    });
    expect(module.parseBroadcastCloseoutFinalizationArchiveStatusCliArgs?.(EQUALS_ARGS)).toMatchObject({
      finalizationStatusPath: "artifacts/finalization-status.json",
      submitResultPath: "artifacts/submit.json",
    });
    expect(() => module.parseBroadcastCloseoutFinalizationArchiveStatusCliArgs?.([])).toThrow(
      "--finalization-archive is required",
    );
    expect(() => module.parseBroadcastCloseoutFinalizationArchiveStatusCliArgs?.(["--output"])).toThrow(
      "--output requires a value",
    );
    expect(() => module.parseBroadcastCloseoutFinalizationArchiveStatusCliArgs?.([
      ...ARGS,
      "--report", "artifacts/other-report.md",
    ])).toThrow("Duplicate argument: --report");
  });

  it("writes successful formatted status through injected dependencies", async () => {
    const module = await import("./status.js") as Module;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutFinalizationArchiveStatusCli?.({
      argv: [...ARGS, "--output", "artifacts/finalization-archive-status.json"],
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      createStatus: () => ({ passed: true }),
      formatStatus: () => "formatted-status\n",
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    expect(outputs).toEqual(["formatted-status"]);
    expect(calls).toContain("read:artifacts/finalization-archive.json");
    expect(calls).toContain("write:artifacts/finalization-archive-status.json:formatted-status\n");
  });

  it("sets failed exit after output without writing artifacts", async () => {
    const module = await import("./status.js") as Module;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutFinalizationArchiveStatusCli?.({
      argv: [...ARGS, "--output", "artifacts/finalization-archive-status.json"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async (path) => path,
      createStatus: () => ({ passed: false }),
      formatStatus: () => "failed-status\n",
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    expect(outputs).toEqual(["failed-status"]);
    expect(exitCodes).toEqual([1]);
    expect(calls).toEqual([]);
  });

  it("rejects malformed arguments before reads", async () => {
    const module = await import("./status.js") as Module;
    const calls: string[] = [];

    await expect(module.runBroadcastCloseoutFinalizationArchiveStatusCli?.({
      argv: ["--unknown"],
      readText: async () => {
        calls.push("read");
        return "";
      },
      createStatus: () => ({ passed: true }),
      formatStatus: () => "",
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
