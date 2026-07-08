import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { formatReadinessCliOutput } from "./readiness.js";

import type { ReadinessCheck, ReadinessCheckResult, ReadinessCommandResult, ReadinessRunner } from "../../base/readiness.js";
import type { ReadinessCliFormat } from "./readiness.js";

type ReadinessCliModule = typeof import("./readiness.js") & {
  isReadinessDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseReadinessCliArgs?: (argv: readonly string[]) => {
    manifestPath?: string | undefined;
    format: ReadinessCliFormat;
  };
  runReadinessCli?: (options?: {
    argv?: readonly string[];
    writeOutput?: (output: string) => void;
    writeError?: (output: string) => void;
    setExitCode?: (code: number) => void;
    buildChecks?: (options?: { manifestPath?: string | undefined }) => ReadinessCheck[];
    createRunner?: () => ReadinessRunner;
    runChecks?: (
      checks: readonly ReadinessCheck[],
      runner: ReadinessRunner,
    ) => Promise<ReadinessCheckResult[]>;
  }) => Promise<void>;
};

const RESULTS: ReadinessCheckResult[] = [
  {
    name: "manifest",
    script: "base:manifest-verify",
    command: "npm",
    args: ["run", "base:manifest-verify", "--", "--summary"],
    exitCode: 0,
    signal: null,
    stdout: "manifest ok",
    stderr: "",
    passed: true,
  },
  {
    name: "agent-account",
    script: "base:agent-account-safety-check",
    command: "npm",
    args: ["run", "base:agent-account-safety-check"],
    exitCode: 1,
    signal: null,
    stdout: "",
    stderr: "policy mismatch",
    passed: false,
  },
];

describe("formatReadinessCliOutput", () => {
  it("keeps the readiness CLI summary readable", () => {
    expect(formatReadinessCliOutput(RESULTS, "summary")).toBe([
      "Base Sepolia readiness",
      "checks: 2",
      "passed: 1",
      "failed: 1",
      "overall: failed",
      "- manifest: passed",
      "- agent-account: failed",
    ].join("\n"));
  });

  it("renders machine-readable readiness output when requested", () => {
    expect(formatReadinessCliOutput(RESULTS, "json")).toBe(JSON.stringify({
      passed: false,
      checks: RESULTS,
    }, null, 2));
  });

  it("renders deterministic machine-readable output for empty readiness results", () => {
    expect(formatReadinessCliOutput([], "json")).toBe(JSON.stringify({
      passed: true,
      checks: [],
    }, null, 2));
  });

  it("rejects malformed readiness CLI output result lists", () => {
    expect(() => formatReadinessCliOutput(null as never, "json")).toThrow(
      "Readiness output results must be an array",
    );
    expect(() => formatReadinessCliOutput("results" as never, "summary")).toThrow(
      "Readiness output results must be an array",
    );
  });

  it("rejects malformed readiness CLI output result entries", () => {
    expect(() => formatReadinessCliOutput([null as never], "json")).toThrow(
      "Readiness output result must be an object",
    );
  });

  it("rejects malformed readiness CLI output result names", () => {
    expect(() => formatReadinessCliOutput([{ passed: true } as never], "json")).toThrow(
      "Readiness output result name must be a string",
    );
    expect(() => formatReadinessCliOutput([{ name: "  ", passed: true } as never], "json")).toThrow(
      "Readiness output result name must not be empty",
    );
  });

  it("rejects malformed readiness CLI output pass states", () => {
    expect(() => formatReadinessCliOutput([{ name: "manifest", passed: "true" } as never], "json")).toThrow(
      "Readiness output result manifest passed must be a boolean",
    );
  });

  it("rejects unsupported readiness CLI output formats", () => {
    expect(() => formatReadinessCliOutput(RESULTS, "text" as never)).toThrow(
      "Readiness output format must be summary or json",
    );
  });
});

describe("isReadinessDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./readiness.js") as ReadinessCliModule;
    const scriptPath = resolve("runtime/cli/base/readiness.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isReadinessDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isReadinessDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isReadinessDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/base/localPreflight.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./readiness.js") as ReadinessCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/base/readiness.ts")).href;

    expect(() => module.isReadinessDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(() => module.isReadinessDirectRun?.(
      moduleUrl,
      ["node", 123] as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseReadinessCliArgs", () => {
  it("uses summary output by default", async () => {
    const module = await import("./readiness.js") as ReadinessCliModule;

    expect(module.parseReadinessCliArgs?.([])).toEqual({
      format: "summary",
    });
  });

  it("parses split and equals-form readiness flags", async () => {
    const module = await import("./readiness.js") as ReadinessCliModule;

    expect(module.parseReadinessCliArgs?.([
      "--manifest",
      " deployments/base-sepolia/custom.json ",
      "--format= json ",
    ])).toEqual({
      manifestPath: "deployments/base-sepolia/custom.json",
      format: "json",
    });
  });

  it("rejects duplicate, missing, unsupported, and invalid format arguments", async () => {
    const module = await import("./readiness.js") as ReadinessCliModule;

    expect(() => module.parseReadinessCliArgs?.(["--manifest", "a.json", "--manifest", "b.json"])).toThrow(
      "Duplicate argument: --manifest",
    );
    expect(() => module.parseReadinessCliArgs?.(["--manifest"])).toThrow("--manifest requires a value");
    expect(() => module.parseReadinessCliArgs?.(["--format", "text"])).toThrow(
      "--format must be summary or json",
    );
    expect(() => module.parseReadinessCliArgs?.(["--unknown"])).toThrow("Unsupported argument: --unknown");
  });
});

describe("runReadinessCli", () => {
  async function runWithInjectedResults(results: unknown, calls: string[] = []): Promise<void> {
    const module = await import("./readiness.js") as ReadinessCliModule;

    await module.runReadinessCli?.({
      argv: [],
      writeOutput: () => calls.push("output"),
      writeError: () => calls.push("error"),
      setExitCode: () => calls.push("exit"),
      buildChecks: () => [],
      createRunner: () => async () => ({
        exitCode: 0,
        signal: null,
        stdout: "",
        stderr: "",
      }),
      runChecks: async () => results as ReadinessCheckResult[],
    });
  }

  it("formats injected readiness results without spawning child commands", async () => {
    const module = await import("./readiness.js") as ReadinessCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];
    const checks: ReadinessCheck[] = [{
      name: "manifest",
      script: "base:manifest-verify",
      command: "npm",
      args: ["run", "base:manifest-verify"],
    }];
    const runner: ReadinessRunner = async (): Promise<ReadinessCommandResult> => ({
      exitCode: 0,
      signal: null,
      stdout: "",
      stderr: "",
    });

    await module.runReadinessCli?.({
      argv: ["--manifest", "deployments/base-sepolia/custom.json", "--format", "json"],
      writeOutput: (output) => outputs.push(output),
      writeError: (output) => calls.push(`error:${output}`),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      buildChecks: (options) => {
        calls.push(`build:${options?.manifestPath ?? ""}`);
        return checks;
      },
      createRunner: () => {
        calls.push("runner");
        return runner;
      },
      runChecks: async (receivedChecks, receivedRunner) => {
        calls.push(`run:${receivedChecks.length}:${receivedRunner === runner}`);
        return [RESULTS[0]!];
      },
    });

    expect(outputs).toEqual([formatReadinessCliOutput([RESULTS[0]!], "json")]);
    expect(calls).toEqual([
      "build:deployments/base-sepolia/custom.json",
      "runner",
      "run:1:true",
    ]);
  });

  it("reports failed readiness diagnostics and sets exit code after output", async () => {
    const module = await import("./readiness.js") as ReadinessCliModule;
    const outputs: string[] = [];
    const errors: string[] = [];
    const exitCodes: number[] = [];

    await module.runReadinessCli?.({
      argv: [],
      writeOutput: (output) => outputs.push(output),
      writeError: (output) => errors.push(output),
      setExitCode: (code) => exitCodes.push(code),
      buildChecks: () => [],
      createRunner: () => async () => ({
        exitCode: 0,
        signal: null,
        stdout: "",
        stderr: "",
      }),
      runChecks: async () => RESULTS,
    });

    expect(outputs).toEqual([formatReadinessCliOutput(RESULTS, "summary")]);
    expect(errors).toEqual([
      "\nFailed readiness checks:",
      "\nagent-account (base:agent-account-safety-check) exited with 1",
      "policy mismatch",
    ]);
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed injected readiness result lists before output or exit-code mutation", async () => {
    const calls: string[] = [];

    await expect(runWithInjectedResults(null, calls)).rejects.toThrow(
      "Readiness CLI results must be an array",
    );
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected readiness result entries before output or diagnostics", async () => {
    const calls: string[] = [];

    await expect(runWithInjectedResults([null], calls)).rejects.toThrow(
      "Readiness CLI result must be an object",
    );
    expect(calls).toEqual([]);
  });

  it("rejects malformed failed readiness result script names before diagnostics", async () => {
    await expect(runWithInjectedResults([{ ...RESULTS[1]!, script: 7 }])).rejects.toThrow(
      "Readiness CLI result agent-account script must be a string",
    );
    await expect(runWithInjectedResults([{ ...RESULTS[1]!, script: "  " }])).rejects.toThrow(
      "Readiness CLI result agent-account script must not be empty",
    );
  });

  it("rejects malformed failed readiness result exit status fields before diagnostics", async () => {
    await expect(runWithInjectedResults([{ ...RESULTS[1]!, exitCode: "1" }])).rejects.toThrow(
      "Readiness CLI result agent-account exitCode must be a number or null",
    );
    await expect(runWithInjectedResults([{ ...RESULTS[1]!, signal: 7 }])).rejects.toThrow(
      "Readiness CLI result agent-account signal must be a string or null",
    );
  });

  it("rejects malformed failed readiness result diagnostic streams before diagnostics", async () => {
    await expect(runWithInjectedResults([{ ...RESULTS[1]!, stdout: 7 }])).rejects.toThrow(
      "Readiness CLI result agent-account stdout must be a string",
    );
    await expect(runWithInjectedResults([{ ...RESULTS[1]!, stderr: 7 }])).rejects.toThrow(
      "Readiness CLI result agent-account stderr must be a string",
    );
  });

  it("rejects malformed arguments before check construction or runner creation", async () => {
    const module = await import("./readiness.js") as ReadinessCliModule;
    const calls: string[] = [];

    await expect(module.runReadinessCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      writeError: () => calls.push("error"),
      buildChecks: () => {
        calls.push("build");
        return [];
      },
      createRunner: () => {
        calls.push("runner");
        return async () => ({
          exitCode: 0,
          signal: null,
          stdout: "",
          stderr: "",
        });
      },
      runChecks: async () => {
        calls.push("run");
        return RESULTS;
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
