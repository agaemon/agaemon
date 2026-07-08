import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type BroadcastCloseoutStatusCliModule = typeof import("./status.js") & {
  isBroadcastCloseoutStatusDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastCloseoutStatusCliArgs?: (argv: readonly string[]) => CloseoutStatusCliArgs;
  runBroadcastCloseoutStatusCli?: (options?: CloseoutStatusRunnerOptions) => Promise<void>;
};

interface CloseoutStatusCliArgs {
  reportPath: string;
  archivePath: string;
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
  outputPath?: string | undefined;
}

interface CloseoutStatusRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createStatus?: (params: unknown) => CloseoutStatus;
  formatStatus?: (status: CloseoutStatus) => string;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface CloseoutStatus {
  passed: boolean;
  failures?: readonly string[];
}

const STATUS_ARGS = [
  "--report",
  "artifacts/report.md",
  "--archive",
  "artifacts/archive.json",
  "--broadcast-receipt",
  "artifacts/receipt.json",
  "--broadcast-package",
  "artifacts/broadcast-package.json",
  "--submit-result",
  "artifacts/submit-result.json",
] as const;

const STATUS: CloseoutStatus = { passed: true, failures: [] };

describe("isBroadcastCloseoutStatusDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./status.js") as BroadcastCloseoutStatusCliModule;
    const scriptPath = resolve("runtime/cli/broadcastCloseout/status/status.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastCloseoutStatusDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isBroadcastCloseoutStatusDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isBroadcastCloseoutStatusDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/broadcastCloseout/closeout/closeout.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./status.js") as BroadcastCloseoutStatusCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/broadcastCloseout/status/status.ts")).href;

    expect(() => module.isBroadcastCloseoutStatusDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseBroadcastCloseoutStatusCliArgs", () => {
  it("requires report, archive, receipt, package, and submit-result paths", async () => {
    const module = await import("./status.js") as BroadcastCloseoutStatusCliModule;

    expect(() => module.parseBroadcastCloseoutStatusCliArgs?.([])).toThrow("--report is required");
    expect(() => module.parseBroadcastCloseoutStatusCliArgs?.(["--report", "report.md"])).toThrow(
      "--archive is required",
    );
  });

  it("parses split and equals-form closeout status flags", async () => {
    const module = await import("./status.js") as BroadcastCloseoutStatusCliModule;

    expect(module.parseBroadcastCloseoutStatusCliArgs?.([
      "--report=artifacts/report.md",
      "--archive",
      "artifacts/archive.json",
      "--broadcast-receipt=artifacts/receipt.json",
      "--broadcast-package",
      "artifacts/broadcast-package.json",
      "--submit-result",
      " artifacts/submit-result.json ",
      "--output=artifacts/status.json",
    ])).toEqual({
      reportPath: "artifacts/report.md",
      archivePath: "artifacts/archive.json",
      broadcastReceiptPath: "artifacts/receipt.json",
      broadcastPackagePath: "artifacts/broadcast-package.json",
      submitResultPath: "artifacts/submit-result.json",
      outputPath: "artifacts/status.json",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./status.js") as BroadcastCloseoutStatusCliModule;

    expect(() => module.parseBroadcastCloseoutStatusCliArgs?.([
      "--report",
      "a.md",
      "--report",
      "b.md",
    ])).toThrow("Duplicate argument: --report");
    expect(() => module.parseBroadcastCloseoutStatusCliArgs?.(["--output"])).toThrow("--output requires a value");
    expect(() => module.parseBroadcastCloseoutStatusCliArgs?.(["--report", "a.md", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runBroadcastCloseoutStatusCli", () => {
  it("writes successful status output and prints formatted status", async () => {
    const module = await import("./status.js") as BroadcastCloseoutStatusCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutStatusCli?.({
      argv: [...STATUS_ARGS, "--output", "artifacts/status.json"],
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      createStatus: (params) => {
        calls.push(`status:${typeof params}`);
        return STATUS;
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
    expect(calls).toEqual([
      "read:artifacts/report.md",
      "read:artifacts/archive.json",
      "read:artifacts/receipt.json",
      "read:artifacts/broadcast-package.json",
      "read:artifacts/submit-result.json",
      "status:object",
      "mkdir:artifacts",
      "write:artifacts/status.json:{\"passed\":true}\n",
    ]);
  });

  it("sets exit code after failed status output without writing artifacts", async () => {
    const module = await import("./status.js") as BroadcastCloseoutStatusCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutStatusCli?.({
      argv: [...STATUS_ARGS, "--output", "artifacts/status.json"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      createStatus: () => ({ passed: false, failures: ["status failed"] }),
      formatStatus: () => "{\"passed\":false}\n",
      writeText: async () => {
        calls.push("write");
      },
    });

    expect(outputs).toEqual(["{\"passed\":false}"]);
    expect(exitCodes).toEqual([1]);
    expect(calls).toEqual([]);
  });

  it("rejects malformed formatted status output before writes, output, or exit code mutation", async () => {
    const module = await import("./status.js") as BroadcastCloseoutStatusCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];
    const exitCodes: number[] = [];

    await expect(module.runBroadcastCloseoutStatusCli?.({
      argv: [...STATUS_ARGS, "--output", "artifacts/status.json"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      createStatus: () => STATUS,
      formatStatus: () => null as unknown as string,
      mkdirp: async () => {
        calls.push("mkdir");
      },
      writeText: async () => {
        calls.push("write");
      },
    })).rejects.toThrow("Broadcast closeout status formatted output must be a string");

    expect(outputs).toEqual([]);
    expect(calls).toEqual([]);
    expect(exitCodes).toEqual([]);
  });

  it("rejects malformed arguments before reads or status creation", async () => {
    const module = await import("./status.js") as BroadcastCloseoutStatusCliModule;
    const calls: string[] = [];

    await expect(module.runBroadcastCloseoutStatusCli?.({
      argv: ["--unknown"],
      readText: async () => {
        calls.push("read");
        return "";
      },
      createStatus: () => STATUS,
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
