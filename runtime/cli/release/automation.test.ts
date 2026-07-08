import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { formatReleaseAutomationCliOutput } from "./automation.js";

import type { BaseSepoliaReleaseAutomationReport } from "../../release/automation.js";

type ReleaseAutomationCliModule = typeof import("./automation.js") & {
  isReleaseAutomationDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseReleaseAutomationCliArgs?: (argv: readonly string[]) => {
    manifestPath?: string | undefined;
    checkpointPath?: string | undefined;
    releaseDir?: string | undefined;
    envExamplePath?: string | undefined;
    readinessRunUrl?: string | undefined;
    summary: boolean;
  };
  runReleaseAutomationCli?: (options?: {
    argv?: readonly string[];
    writeOutput?: (output: string) => void;
    setExitCode?: (code: number) => void;
    runAutomation?: (options: {
      manifestPath?: string | undefined;
      checkpointPath?: string | undefined;
      releaseDir?: string | undefined;
      envExamplePath?: string | undefined;
      readinessRunUrl?: string | undefined;
    }) => Promise<BaseSepoliaReleaseAutomationReport>;
  }) => Promise<void>;
};

const REPORT: BaseSepoliaReleaseAutomationReport = {
  manifestPath: "deployments/base-sepolia/latest.json",
  checkpointPath: "artifacts/base-sepolia-readiness-checkpoint.json",
  releaseDir: "docs/releases",
  envExamplePath: ".env.example",
  readinessRunUrl: "https://github.com/sagaratalatti/agentos-kernel/actions/runs/28364588809",
  passed: false,
  steps: [
    {
      name: "readiness-checkpoint",
      script: "base:readiness-checkpoint",
      command: "npm",
      args: ["run", "base:readiness-checkpoint"],
      exitCode: 0,
      signal: null,
      stdout: "readiness-checkpoint ok",
      stderr: "",
      passed: true,
    },
    {
      name: "checkpoint-verify",
      script: "base:checkpoint-verify",
      command: "npm",
      args: ["run", "base:checkpoint-verify"],
      exitCode: 1,
      signal: null,
      stdout: "checkpoint-verify stdout",
      stderr: "checkpoint stale",
      passed: false,
    },
  ],
};

describe("formatReleaseAutomationCliOutput", () => {
  it("keeps JSON as the default release automation CLI output", () => {
    expect(formatReleaseAutomationCliOutput(REPORT, false)).toBe(JSON.stringify(REPORT, null, 2));
  });

  it("renders a concise release automation CLI summary when requested", () => {
    expect(formatReleaseAutomationCliOutput(REPORT, true)).toBe([
      "Base Sepolia release automation",
      "manifest: deployments/base-sepolia/latest.json",
      "checkpoint: artifacts/base-sepolia-readiness-checkpoint.json",
      "releaseDir: docs/releases",
      "readinessRunUrl: https://github.com/sagaratalatti/agentos-kernel/actions/runs/28364588809",
      "steps: 2",
      "passed: 1",
      "failed: 1",
      "overall: failed",
      "- readiness-checkpoint: passed",
      "- checkpoint-verify: failed (checkpoint stale)",
    ].join("\n"));
  });

  it("rejects malformed release automation reports before rendering", () => {
    expect(() => formatReleaseAutomationCliOutput(
      null as unknown as BaseSepoliaReleaseAutomationReport,
      false,
    )).toThrow("Release automation report must be an object");
    expect(() => formatReleaseAutomationCliOutput({
      ...REPORT,
      manifestPath: "",
    }, false)).toThrow("Release automation report manifestPath must not be empty");
    expect(() => formatReleaseAutomationCliOutput({
      ...REPORT,
      readinessRunUrl: "",
    }, false)).toThrow("Release automation report readinessRunUrl must not be empty");
  });

  it("rejects malformed release automation summary flags before rendering", () => {
    expect(() => formatReleaseAutomationCliOutput(
      REPORT,
      "summary" as unknown as boolean,
    )).toThrow("Release automation summary flag must be a boolean");
  });

  it("rejects malformed release automation state and step lists before rendering", () => {
    expect(() => formatReleaseAutomationCliOutput({
      ...REPORT,
      passed: "false" as unknown as boolean,
    }, false)).toThrow("Release automation report passed must be a boolean");
    expect(() => formatReleaseAutomationCliOutput({
      ...REPORT,
      steps: "steps" as unknown as BaseSepoliaReleaseAutomationReport["steps"],
    }, false)).toThrow("Release automation report steps must be an array");
  });

  it("rejects malformed release automation step results before rendering", () => {
    expect(() => formatReleaseAutomationCliOutput({
      ...REPORT,
      steps: [{ ...REPORT.steps[0]!, name: "" }],
    }, true)).toThrow("Release automation report step 0 name must not be empty");
    expect(() => formatReleaseAutomationCliOutput({
      ...REPORT,
      steps: [{ ...REPORT.steps[0]!, command: "node" as "npm" }],
    }, true)).toThrow("Release automation report step 0 command must be npm");
    expect(() => formatReleaseAutomationCliOutput({
      ...REPORT,
      steps: [{ ...REPORT.steps[0]!, args: ["run", 123 as unknown as string] }],
    }, true)).toThrow("Release automation report step 0 args must be an array of strings");
    expect(() => formatReleaseAutomationCliOutput({
      ...REPORT,
      steps: [{ ...REPORT.steps[0]!, exitCode: "0" as unknown as number }],
    }, true)).toThrow("Release automation report step 0 exitCode must be an integer or null");
    expect(() => formatReleaseAutomationCliOutput({
      ...REPORT,
      steps: [{ ...REPORT.steps[0]!, passed: "true" as unknown as boolean }],
    }, true)).toThrow("Release automation report step 0 passed must be a boolean");
  });
});

describe("isReleaseAutomationDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./automation.js") as ReleaseAutomationCliModule;
    const scriptPath = resolve("runtime/cli/release/automation.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isReleaseAutomationDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isReleaseAutomationDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isReleaseAutomationDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/release/status.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./automation.js") as ReleaseAutomationCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/release/automation.ts")).href;

    expect(() => module.isReleaseAutomationDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(() => module.isReleaseAutomationDirectRun?.(
      moduleUrl,
      ["node", 123] as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseReleaseAutomationCliArgs", () => {
  it("uses JSON output by default with no optional paths", async () => {
    const module = await import("./automation.js") as ReleaseAutomationCliModule;

    expect(module.parseReleaseAutomationCliArgs?.([])).toEqual({
      summary: false,
    });
  });

  it("parses split and equals-form release automation flags", async () => {
    const module = await import("./automation.js") as ReleaseAutomationCliModule;

    expect(module.parseReleaseAutomationCliArgs?.([
      "--manifest",
      "deployments/base-sepolia/custom.json",
      "--checkpoint=artifacts/checkpoint.json",
      "--dir",
      "docs/custom-releases",
      "--env-example=.env.example.custom",
      "--readiness-run-url",
      "https://github.com/example/actions/runs/1",
      "--summary",
    ])).toEqual({
      manifestPath: "deployments/base-sepolia/custom.json",
      checkpointPath: "artifacts/checkpoint.json",
      releaseDir: "docs/custom-releases",
      envExamplePath: ".env.example.custom",
      readinessRunUrl: "https://github.com/example/actions/runs/1",
      summary: true,
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./automation.js") as ReleaseAutomationCliModule;

    expect(() => module.parseReleaseAutomationCliArgs?.(["--manifest", "a.json", "--manifest", "b.json"])).toThrow(
      "Duplicate argument: --manifest",
    );
    expect(() => module.parseReleaseAutomationCliArgs?.(["--summary", "--summary"])).toThrow(
      "Duplicate argument: --summary",
    );
    expect(() => module.parseReleaseAutomationCliArgs?.(["--checkpoint"])).toThrow("--checkpoint requires a value");
    expect(() => module.parseReleaseAutomationCliArgs?.(["--unknown"])).toThrow("Unsupported argument: --unknown");
  });
});

describe("runReleaseAutomationCli", () => {
  it("runs injected release automation and writes JSON output", async () => {
    const module = await import("./automation.js") as ReleaseAutomationCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runReleaseAutomationCli?.({
      argv: [
        "--manifest",
        "deployments/base-sepolia/latest.json",
        "--checkpoint",
        "artifacts/base-sepolia-readiness-checkpoint.json",
        "--dir",
        "docs/releases",
        "--env-example",
        ".env.example",
        "--readiness-run-url",
        "https://github.com/sagaratalatti/agentos-kernel/actions/runs/28364588809",
      ],
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      runAutomation: async (options) => {
        const automationOptions = options ?? {};
        calls.push([
          automationOptions.manifestPath,
          automationOptions.checkpointPath,
          automationOptions.releaseDir,
          automationOptions.envExamplePath,
          automationOptions.readinessRunUrl,
        ].join("|"));
        return { ...REPORT, passed: true, steps: REPORT.steps.map((step) => ({ ...step, passed: true, exitCode: 0, stderr: "" })) };
      },
    });

    const passedReport = {
      ...REPORT,
      passed: true,
      steps: REPORT.steps.map((step) => ({ ...step, passed: true, exitCode: 0, stderr: "" })),
    };
    expect(outputs).toEqual([formatReleaseAutomationCliOutput(passedReport, false)]);
    expect(calls).toEqual([
      [
        "deployments/base-sepolia/latest.json",
        "artifacts/base-sepolia-readiness-checkpoint.json",
        "docs/releases",
        ".env.example",
        "https://github.com/sagaratalatti/agentos-kernel/actions/runs/28364588809",
      ].join("|"),
    ]);
  });

  it("sets exit code after failed injected automation summary output", async () => {
    const module = await import("./automation.js") as ReleaseAutomationCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runReleaseAutomationCli?.({
      argv: ["--summary"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      runAutomation: async () => REPORT,
    });

    expect(outputs).toEqual([formatReleaseAutomationCliOutput(REPORT, true)]);
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed arguments before automation starts", async () => {
    const module = await import("./automation.js") as ReleaseAutomationCliModule;
    const calls: string[] = [];

    await expect(module.runReleaseAutomationCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      runAutomation: async () => {
        calls.push("run");
        return REPORT;
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected automation reports before output or exit-code mutation", async () => {
    const module = await import("./automation.js") as ReleaseAutomationCliModule;
    const calls: string[] = [];

    await expect(module.runReleaseAutomationCli?.({
      argv: ["--summary"],
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      runAutomation: async () => {
        calls.push("run");
        return { ...REPORT, passed: "no" as unknown as boolean };
      },
    })).rejects.toThrow("Release automation report passed must be a boolean");
    expect(calls).toEqual(["run"]);
  });
});
