import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { formatCheckpointCliOutput } from "./checkpoint.js";

import type { ReadinessCheckpoint } from "../../base/checkpoint.js";
import type { CheckpointCliFormat } from "./checkpoint.js";

type CheckpointCliModule = typeof import("./checkpoint.js") & {
  isCheckpointDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseCheckpointCliArgs?: (argv: readonly string[]) => {
    manifestPath?: string | undefined;
    outputPath?: string | undefined;
    readinessRunUrl?: string | undefined;
    format: CheckpointCliFormat;
  };
  runCheckpointCli?: (options?: {
    argv?: readonly string[];
    writeOutput?: (output: string) => void;
    writeError?: (output: string) => void;
    setExitCode?: (code: number) => void;
    createCheckpoint?: (params: {
      manifestPath?: string | undefined;
      readinessRunUrl?: string | undefined;
    }) => Promise<ReadinessCheckpoint>;
    writeCheckpoint?: (path: string, checkpoint: ReadinessCheckpoint) => Promise<void>;
  }) => Promise<void>;
};

const CHECKPOINT: ReadinessCheckpoint = {
  schemaVersion: 1,
  generatedAt: "2026-06-25T06:30:00.000Z",
  commit: {
    sha: "0123456789abcdef0123456789abcdef01234567",
  },
  manifest: {
    path: "deployments/base-sepolia/latest.json",
    sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    network: "base-sepolia",
    chainId: 84532,
  },
  readiness: {
    summary: {
      checks: 2,
      passed: 1,
      failed: 1,
      overall: "failed",
    },
    checks: [
      {
        name: "manifest",
        script: "base:manifest-verify",
        command: "npm run base:manifest-verify -- --summary",
        passed: true,
        exitCode: 0,
        signal: null,
        stdout: "ok",
        stderr: "",
      },
      {
        name: "swap",
        script: "base:swap-safety-check",
        command: "npm run base:swap-safety-check",
        passed: false,
        exitCode: 1,
        signal: null,
        stdout: "",
        stderr: "swap failed",
      },
    ],
  },
};

const PASSED_CHECKPOINT: ReadinessCheckpoint = {
  ...CHECKPOINT,
  readiness: {
    ...CHECKPOINT.readiness,
    summary: {
      checks: 2,
      passed: 2,
      failed: 0,
      overall: "passed",
    },
    checks: CHECKPOINT.readiness.checks.map((check) => ({
      ...check,
      passed: true,
      exitCode: 0,
      stderr: "",
    })),
  },
};

describe("formatCheckpointCliOutput", () => {
  it("keeps JSON checkpoint output available for automation", () => {
    expect(formatCheckpointCliOutput(CHECKPOINT, "json")).toBe(JSON.stringify(CHECKPOINT, null, 2));
  });

  it("renders the readable checkpoint summary and output path when requested", () => {
    expect(formatCheckpointCliOutput(CHECKPOINT, "summary", "artifacts/base-sepolia-readiness-checkpoint.json")).toBe([
      "Base Sepolia readiness checkpoint",
      "generatedAt: 2026-06-25T06:30:00.000Z",
      "commit: 0123456789abcdef0123456789abcdef01234567",
      "manifest: deployments/base-sepolia/latest.json",
      "manifestSha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "network: base-sepolia",
      "chainId: 84532",
      "readinessRunUrl: not recorded",
      "checks: 2",
      "passed: 1",
      "failed: 1",
      "overall: failed",
      "- manifest: passed",
      "- swap: failed",
      "checkpoint: artifacts/base-sepolia-readiness-checkpoint.json",
    ].join("\n"));
  });

  it("rejects malformed checkpoint values before output formatting", () => {
    expect(() => formatCheckpointCliOutput(null as never, "json")).toThrow(
      "Checkpoint output checkpoint must be an object",
    );
  });

  it("rejects unsupported checkpoint output formats", () => {
    expect(() => formatCheckpointCliOutput(CHECKPOINT, "text" as never)).toThrow(
      "Checkpoint output format must be json or summary",
    );
  });

  it("rejects malformed checkpoint output paths", () => {
    expect(() => formatCheckpointCliOutput(CHECKPOINT, "summary", 7 as never)).toThrow(
      "Checkpoint output path must be a string",
    );
    expect(() => formatCheckpointCliOutput(CHECKPOINT, "summary", "  ")).toThrow(
      "Checkpoint output path must not be empty",
    );
  });

  it("rejects malformed checkpoint summary fields before readable output", () => {
    expect(() => formatCheckpointCliOutput({
      ...CHECKPOINT,
      readiness: {
        ...CHECKPOINT.readiness,
        summary: {
          ...CHECKPOINT.readiness.summary,
          failed: "1",
        },
      },
    } as never, "summary")).toThrow("Checkpoint output readiness summary failed must be a number");
  });

  it("rejects malformed checkpoint readiness check lists before readable output", () => {
    expect(() => formatCheckpointCliOutput({
      ...CHECKPOINT,
      readiness: {
        ...CHECKPOINT.readiness,
        checks: "checks",
      },
    } as never, "summary")).toThrow("Checkpoint output readiness checks must be an array");
  });
});

describe("isCheckpointDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./checkpoint.js") as CheckpointCliModule;
    const scriptPath = resolve("runtime/cli/base/checkpoint.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isCheckpointDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isCheckpointDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isCheckpointDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/base/checkpointVerify.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./checkpoint.js") as CheckpointCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/base/checkpoint.ts")).href;

    expect(() => module.isCheckpointDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(() => module.isCheckpointDirectRun?.(
      moduleUrl,
      ["node", 123] as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseCheckpointCliArgs", () => {
  it("uses JSON output by default when no output path is provided", async () => {
    const module = await import("./checkpoint.js") as CheckpointCliModule;

    expect(module.parseCheckpointCliArgs?.([])).toEqual({
      format: "json",
    });
  });

  it("uses summary output by default when an output path is provided", async () => {
    const module = await import("./checkpoint.js") as CheckpointCliModule;

    expect(module.parseCheckpointCliArgs?.(["--output", "artifacts/checkpoint.json"])).toEqual({
      outputPath: "artifacts/checkpoint.json",
      format: "summary",
    });
  });

  it("parses split and equals-form checkpoint flags", async () => {
    const module = await import("./checkpoint.js") as CheckpointCliModule;

    expect(module.parseCheckpointCliArgs?.([
      "--manifest",
      "deployments/base-sepolia/custom.json",
      "--output=artifacts/checkpoint.json",
      "--readiness-run-url",
      "https://github.com/example/actions/runs/1",
      "--format= json ",
    ])).toEqual({
      manifestPath: "deployments/base-sepolia/custom.json",
      outputPath: "artifacts/checkpoint.json",
      readinessRunUrl: "https://github.com/example/actions/runs/1",
      format: "json",
    });
  });

  it("rejects duplicate, missing, unsupported, and invalid format arguments", async () => {
    const module = await import("./checkpoint.js") as CheckpointCliModule;

    expect(() => module.parseCheckpointCliArgs?.(["--manifest", "a.json", "--manifest", "b.json"])).toThrow(
      "Duplicate argument: --manifest",
    );
    expect(() => module.parseCheckpointCliArgs?.(["--output"])).toThrow("--output requires a value");
    expect(() => module.parseCheckpointCliArgs?.(["--readiness-run-url", "--format"])).toThrow(
      "--readiness-run-url requires a value",
    );
    expect(() => module.parseCheckpointCliArgs?.(["--format", "text"])).toThrow("--format must be json or summary");
    expect(() => module.parseCheckpointCliArgs?.(["--unknown"])).toThrow("Unsupported argument: --unknown");
  });
});

describe("runCheckpointCli", () => {
  async function runWithInjectedCheckpoint(checkpoint: unknown, calls: string[] = []): Promise<void> {
    const module = await import("./checkpoint.js") as CheckpointCliModule;

    await module.runCheckpointCli?.({
      argv: ["--output", "artifacts/checkpoint.json"],
      writeOutput: () => calls.push("output"),
      writeError: () => calls.push("error"),
      setExitCode: () => calls.push("exit"),
      createCheckpoint: async () => checkpoint as ReadinessCheckpoint,
      writeCheckpoint: async () => {
        calls.push("write");
      },
    });
  }

  it("formats injected checkpoints as JSON without writing artifacts", async () => {
    const module = await import("./checkpoint.js") as CheckpointCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runCheckpointCli?.({
      argv: ["--manifest", "deployments/base-sepolia/custom.json"],
      writeOutput: (output) => outputs.push(output),
      writeError: (output) => calls.push(`error:${output}`),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      createCheckpoint: async (params) => {
        calls.push(`create:${params.manifestPath ?? ""}:${params.readinessRunUrl ?? ""}`);
        return PASSED_CHECKPOINT;
      },
      writeCheckpoint: async () => {
        throw new Error("writeCheckpoint should not be called");
      },
    });

    expect(outputs).toEqual([formatCheckpointCliOutput(PASSED_CHECKPOINT, "json")]);
    expect(calls).toEqual(["create:deployments/base-sepolia/custom.json:"]);
  });

  it("writes injected checkpoints before emitting output-path summaries", async () => {
    const module = await import("./checkpoint.js") as CheckpointCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runCheckpointCli?.({
      argv: [
        "--output",
        "artifacts/checkpoint.json",
        "--readiness-run-url",
        "https://github.com/example/actions/runs/1",
      ],
      writeOutput: (output) => outputs.push(output),
      writeError: (output) => calls.push(`error:${output}`),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      createCheckpoint: async (params) => {
        calls.push(`create:${params.readinessRunUrl ?? ""}`);
        return PASSED_CHECKPOINT;
      },
      writeCheckpoint: async (path, checkpoint) => {
        calls.push(`write:${path}:${checkpoint.schemaVersion}`);
      },
    });

    expect(outputs).toEqual([
      formatCheckpointCliOutput(PASSED_CHECKPOINT, "summary", "artifacts/checkpoint.json"),
    ]);
    expect(calls).toEqual([
      "create:https://github.com/example/actions/runs/1",
      "write:artifacts/checkpoint.json:1",
    ]);
  });

  it("reports failed readiness diagnostics and sets exit code after output", async () => {
    const module = await import("./checkpoint.js") as CheckpointCliModule;
    const outputs: string[] = [];
    const errors: string[] = [];
    const exitCodes: number[] = [];

    await module.runCheckpointCli?.({
      argv: ["--format", "summary"],
      writeOutput: (output) => outputs.push(output),
      writeError: (output) => errors.push(output),
      setExitCode: (code) => exitCodes.push(code),
      createCheckpoint: async () => CHECKPOINT,
      writeCheckpoint: async () => {
        throw new Error("writeCheckpoint should not be called");
      },
    });

    expect(outputs).toEqual([formatCheckpointCliOutput(CHECKPOINT, "summary")]);
    expect(errors).toEqual([
      "\nFailed readiness checks:",
      "\nswap (base:swap-safety-check) exited with 1",
      "swap failed",
    ]);
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed injected checkpoints before artifact writes or output", async () => {
    const calls: string[] = [];

    await expect(runWithInjectedCheckpoint(null, calls)).rejects.toThrow(
      "Checkpoint CLI checkpoint must be an object",
    );
    expect(calls).toEqual([]);
  });

  it("rejects malformed failed checkpoint check identities before diagnostics", async () => {
    await expect(runWithInjectedCheckpoint({
      ...CHECKPOINT,
      readiness: {
        ...CHECKPOINT.readiness,
        checks: CHECKPOINT.readiness.checks.map((check) =>
          check.passed ? check : { ...check, name: "  " },
        ),
      },
    })).rejects.toThrow("Checkpoint CLI failed check name must not be empty");
    await expect(runWithInjectedCheckpoint({
      ...CHECKPOINT,
      readiness: {
        ...CHECKPOINT.readiness,
        checks: CHECKPOINT.readiness.checks.map((check) =>
          check.passed ? check : { ...check, script: 7 },
        ),
      },
    })).rejects.toThrow("Checkpoint CLI failed check swap script must be a string");
  });

  it("rejects malformed failed checkpoint check exit status fields before diagnostics", async () => {
    await expect(runWithInjectedCheckpoint({
      ...CHECKPOINT,
      readiness: {
        ...CHECKPOINT.readiness,
        checks: CHECKPOINT.readiness.checks.map((check) =>
          check.passed ? check : { ...check, exitCode: "1" },
        ),
      },
    })).rejects.toThrow("Checkpoint CLI failed check swap exitCode must be a number or null");
    await expect(runWithInjectedCheckpoint({
      ...CHECKPOINT,
      readiness: {
        ...CHECKPOINT.readiness,
        checks: CHECKPOINT.readiness.checks.map((check) =>
          check.passed ? check : { ...check, signal: 7 },
        ),
      },
    })).rejects.toThrow("Checkpoint CLI failed check swap signal must be a string or null");
  });

  it("rejects malformed failed checkpoint check diagnostic streams before diagnostics", async () => {
    await expect(runWithInjectedCheckpoint({
      ...CHECKPOINT,
      readiness: {
        ...CHECKPOINT.readiness,
        checks: CHECKPOINT.readiness.checks.map((check) =>
          check.passed ? check : { ...check, stdout: 7 },
        ),
      },
    })).rejects.toThrow("Checkpoint CLI failed check swap stdout must be a string");
    await expect(runWithInjectedCheckpoint({
      ...CHECKPOINT,
      readiness: {
        ...CHECKPOINT.readiness,
        checks: CHECKPOINT.readiness.checks.map((check) =>
          check.passed ? check : { ...check, stderr: 7 },
        ),
      },
    })).rejects.toThrow("Checkpoint CLI failed check swap stderr must be a string");
  });

  it("rejects malformed arguments before checkpoint creation or writes", async () => {
    const module = await import("./checkpoint.js") as CheckpointCliModule;
    const calls: string[] = [];

    await expect(module.runCheckpointCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      writeError: () => calls.push("error"),
      createCheckpoint: async () => {
        calls.push("create");
        return CHECKPOINT;
      },
      writeCheckpoint: async () => {
        calls.push("write");
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
