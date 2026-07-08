import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type BroadcastCloseoutCliModule = typeof import("./closeout.js") & {
  isBroadcastCloseoutDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastCloseoutCliArgs?: (argv: readonly string[]) => CloseoutCliArgs;
  runBroadcastCloseoutCli?: (options?: CloseoutRunnerOptions) => Promise<void>;
};

interface CloseoutCliArgs {
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
  reportOutputPath: string;
  archiveOutputPath: string;
  statusOutputPath?: string | undefined;
  generatedAt?: string | undefined;
}

interface CloseoutRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createCloseout?: (params: unknown) => CloseoutResult;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface CloseoutResult {
  passed: boolean;
  failures: readonly string[];
  report: { path: string; markdown: string };
  archive: { path: string; json: string };
  status: { path: string; json: string } | null;
}

const CLOSEOUT_ARGS = [
  "--broadcast-receipt",
  "artifacts/receipt.json",
  "--broadcast-package",
  "artifacts/broadcast-package.json",
  "--submit-result",
  "artifacts/submit-result.json",
  "--report-output",
  "artifacts/report.md",
  "--archive-output",
  "artifacts/archive.json",
] as const;

const CLOSEOUT_RESULT: CloseoutResult = {
  passed: true,
  failures: [],
  report: { path: "artifacts/report.md", markdown: "# Broadcast Report\n" },
  archive: { path: "artifacts/archive.json", json: "{}\n" },
  status: { path: "artifacts/status.json", json: "{\"passed\":true}\n" },
};

describe("isBroadcastCloseoutDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./closeout.js") as BroadcastCloseoutCliModule;
    const scriptPath = resolve("runtime/cli/broadcastCloseout/closeout/closeout.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastCloseoutDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isBroadcastCloseoutDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isBroadcastCloseoutDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/broadcastCloseout/status/status.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./closeout.js") as BroadcastCloseoutCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/broadcastCloseout/closeout/closeout.ts")).href;

    expect(() => module.isBroadcastCloseoutDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseBroadcastCloseoutCliArgs", () => {
  it("requires receipt, package, submit-result, report-output, and archive-output paths", async () => {
    const module = await import("./closeout.js") as BroadcastCloseoutCliModule;

    expect(() => module.parseBroadcastCloseoutCliArgs?.([])).toThrow("--broadcast-receipt is required");
    expect(() => module.parseBroadcastCloseoutCliArgs?.([
      "--broadcast-receipt",
      "receipt.json",
    ])).toThrow("--broadcast-package is required");
  });

  it("parses split and equals-form closeout flags", async () => {
    const module = await import("./closeout.js") as BroadcastCloseoutCliModule;

    expect(module.parseBroadcastCloseoutCliArgs?.([
      "--broadcast-receipt=artifacts/receipt.json",
      "--broadcast-package",
      "artifacts/broadcast-package.json",
      "--submit-result=artifacts/submit-result.json",
      "--report-output",
      " artifacts/report.md ",
      "--archive-output=artifacts/archive.json",
      "--status-output",
      "artifacts/status.json",
      "--generated-at=2026-07-01T08:00:00.000Z",
    ])).toEqual({
      broadcastReceiptPath: "artifacts/receipt.json",
      broadcastPackagePath: "artifacts/broadcast-package.json",
      submitResultPath: "artifacts/submit-result.json",
      reportOutputPath: "artifacts/report.md",
      archiveOutputPath: "artifacts/archive.json",
      statusOutputPath: "artifacts/status.json",
      generatedAt: "2026-07-01T08:00:00.000Z",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./closeout.js") as BroadcastCloseoutCliModule;

    expect(() => module.parseBroadcastCloseoutCliArgs?.([
      "--broadcast-receipt",
      "a.json",
      "--broadcast-receipt",
      "b.json",
    ])).toThrow("Duplicate argument: --broadcast-receipt");
    expect(() => module.parseBroadcastCloseoutCliArgs?.(["--generated-at"])).toThrow(
      "--generated-at requires a value",
    );
    expect(() => module.parseBroadcastCloseoutCliArgs?.(["--broadcast-receipt", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runBroadcastCloseoutCli", () => {
  it("writes successful closeout evidence and emits JSON summaries", async () => {
    const module = await import("./closeout.js") as BroadcastCloseoutCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutCli?.({
      argv: [...CLOSEOUT_ARGS, "--status-output", "artifacts/status.json"],
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      createCloseout: (params) => {
        calls.push(`closeout:${typeof params}`);
        return CLOSEOUT_RESULT;
      },
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    expect(JSON.parse(outputs[0]!)).toEqual({
      report: "artifacts/report.md",
      archive: "artifacts/archive.json",
      status: "artifacts/status.json",
      passed: true,
      failures: [],
    });
    expect(calls).toEqual([
      "read:artifacts/receipt.json",
      "read:artifacts/broadcast-package.json",
      "read:artifacts/submit-result.json",
      "closeout:object",
      "mkdir:artifacts",
      "write:artifacts/report.md:# Broadcast Report\n",
      "mkdir:artifacts",
      "write:artifacts/archive.json:{}\n",
      "mkdir:artifacts",
      "write:artifacts/status.json:{\"passed\":true}\n",
    ]);
  });

  it("sets exit code after failed closeout output without writing artifacts", async () => {
    const module = await import("./closeout.js") as BroadcastCloseoutCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutCli?.({
      argv: CLOSEOUT_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      createCloseout: () => ({
        ...CLOSEOUT_RESULT,
        passed: false,
        failures: ["closeout failed"],
        status: null,
      }),
      writeText: async () => {
        calls.push("write");
      },
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ passed: false, failures: ["closeout failed"] });
    expect(exitCodes).toEqual([1]);
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected closeout results before writes, output, or exit code mutation", async () => {
    const module = await import("./closeout.js") as BroadcastCloseoutCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];
    const exitCodes: number[] = [];

    await expect(module.runBroadcastCloseoutCli?.({
      argv: CLOSEOUT_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      createCloseout: () => ({
        ...CLOSEOUT_RESULT,
        report: { path: "artifacts/report.md", markdown: null },
      } as unknown as CloseoutResult),
      mkdirp: async () => {
        calls.push("mkdir");
      },
      writeText: async () => {
        calls.push("write");
      },
    })).rejects.toThrow("Broadcast closeout result report markdown must be a string");

    expect(outputs).toEqual([]);
    expect(calls).toEqual([]);
    expect(exitCodes).toEqual([]);
  });

  it("rejects malformed arguments before reads or closeout creation", async () => {
    const module = await import("./closeout.js") as BroadcastCloseoutCliModule;
    const calls: string[] = [];

    await expect(module.runBroadcastCloseoutCli?.({
      argv: ["--unknown"],
      readText: async () => {
        calls.push("read");
        return "";
      },
      createCloseout: () => CLOSEOUT_RESULT,
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
