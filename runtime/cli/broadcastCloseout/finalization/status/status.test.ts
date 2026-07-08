import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type FinalizationStatusModule = typeof import("./status.js") & {
  isBroadcastCloseoutFinalizationStatusDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastCloseoutFinalizationStatusCliArgs?: (argv: readonly string[]) => FinalizationStatusArgs;
  runBroadcastCloseoutFinalizationStatusCli?: (options?: FinalizationStatusOptions) => Promise<void>;
};

interface FinalizationStatusArgs {
  summaryPath: string;
  reportPath: string;
  archivePath: string;
  statusPath: string;
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
  outputPath?: string;
}

interface FinalizationStatusOptions {
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

const STATUS_ARGS = [
  "--summary",
  "artifacts/summary.md",
  "--report",
  "artifacts/report.md",
  "--archive",
  "artifacts/archive.json",
  "--status",
  "artifacts/status.json",
  "--broadcast-receipt",
  "artifacts/receipt.json",
  "--broadcast-package",
  "artifacts/package.json",
  "--submit-result",
  "artifacts/submit.json",
] as const;

describe("finalization status CLI seams", () => {
  it("detects direct execution, parses args, and rejects bad args", async () => {
    const module = await import("./status.js") as FinalizationStatusModule;
    const scriptPath = resolve("runtime/cli/broadcastCloseout/finalization/status/status.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastCloseoutFinalizationStatusDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(() => module.isBroadcastCloseoutFinalizationStatusDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(module.parseBroadcastCloseoutFinalizationStatusCliArgs?.([
      ...STATUS_ARGS,
      "--output=artifacts/finalization-status.json",
    ])).toMatchObject({ outputPath: "artifacts/finalization-status.json" });
    expect(() => module.parseBroadcastCloseoutFinalizationStatusCliArgs?.([])).toThrow("--summary is required");
    expect(() => module.parseBroadcastCloseoutFinalizationStatusCliArgs?.(["--output"])).toThrow(
      "--output requires a value",
    );
  });

  it("writes successful status output and rejects malformed args before reads", async () => {
    const module = await import("./status.js") as FinalizationStatusModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutFinalizationStatusCli?.({
      argv: [...STATUS_ARGS, "--output", "artifacts/finalization-status.json"],
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      createStatus: (params) => {
        calls.push(`status:${typeof params}`);
        return { passed: true };
      },
      formatStatus: () => "{\"passed\":true}\n",
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    expect(outputs).toEqual(["{\"passed\":true}"]);
    expect(calls).toContain("write:artifacts/finalization-status.json:{\"passed\":true}\n");

    await expect(module.runBroadcastCloseoutFinalizationStatusCli?.({
      argv: ["--unknown"],
      readText: async () => {
        calls.push("bad-read");
        return "";
      },
      createStatus: () => ({ passed: true }),
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).not.toContain("bad-read");
  });

  it("sets exit code after failed status output without writing artifacts", async () => {
    const module = await import("./status.js") as FinalizationStatusModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutFinalizationStatusCli?.({
      argv: [...STATUS_ARGS, "--output", "artifacts/finalization-status.json"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      createStatus: () => ({ passed: false }),
      formatStatus: () => "{\"passed\":false}\n",
      writeText: async () => {
        calls.push("write");
      },
    });

    expect(outputs).toEqual(["{\"passed\":false}"]);
    expect(exitCodes).toEqual([1]);
    expect(calls).toEqual([]);
  });
});
