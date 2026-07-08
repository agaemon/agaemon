import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { formatCheckpointVerifyCliOutput } from "./checkpointVerify.js";

import type {
  ReadinessCheckpoint,
  ReadinessCheckpointVerification,
  VerifyReadinessCheckpointParams,
} from "../../base/checkpoint.js";
import type { CheckpointVerifyCliReport } from "./checkpointVerify.js";
import type { CheckpointVerifyCliFormat } from "./checkpointVerify.js";

type CheckpointVerifyCliModule = typeof import("./checkpointVerify.js") & {
  isCheckpointVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseCheckpointVerifyCliArgs?: (argv: readonly string[]) => {
    checkpointPath: string;
    manifestPath?: string | undefined;
    requireRunUrl: boolean;
    format: CheckpointVerifyCliFormat;
  };
  runCheckpointVerifyCli?: (options?: {
    argv?: readonly string[];
    writeOutput?: (output: string) => void;
    setExitCode?: (code: number) => void;
    readCheckpoint?: (path: string) => Promise<unknown>;
    readManifestText?: (path: string) => Promise<string>;
    verifyCheckpoint?: (
      checkpoint: unknown,
      params?: VerifyReadinessCheckpointParams,
    ) => ReadinessCheckpointVerification;
  }) => Promise<void>;
};

const REPORT: CheckpointVerifyCliReport = {
  checkpoint: "artifacts/base-sepolia-readiness-checkpoint.json",
  manifest: "deployments/base-sepolia/latest.json",
  requireRunUrl: true,
  passed: false,
  failures: [
    "manifest sha256 does not match current manifest",
    "readiness run URL is required",
  ],
};

const PASSED_REPORT: CheckpointVerifyCliReport = {
  checkpoint: "artifacts/checkpoint.json",
  requireRunUrl: false,
  passed: true,
  failures: [],
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
      checks: 0,
      passed: 0,
      failed: 0,
      overall: "passed",
    },
    checks: [],
  },
};

describe("formatCheckpointVerifyCliOutput", () => {
  it("keeps JSON checkpoint verification output available for automation", () => {
    expect(formatCheckpointVerifyCliOutput(REPORT, "json")).toBe(JSON.stringify(REPORT, null, 2));
  });

  it("renders a readable checkpoint verification summary when requested", () => {
    expect(formatCheckpointVerifyCliOutput(REPORT, "summary")).toBe([
      "Base Sepolia readiness checkpoint verification",
      "checkpoint: artifacts/base-sepolia-readiness-checkpoint.json",
      "manifest: deployments/base-sepolia/latest.json",
      "requireRunUrl: true",
      "passed: false",
      "failures: 2",
      "- manifest sha256 does not match current manifest",
      "- readiness run URL is required",
    ].join("\n"));
  });

  it("rejects malformed checkpoint verification reports before output formatting", () => {
    expect(() => formatCheckpointVerifyCliOutput(null as never, "json")).toThrow(
      "Checkpoint verification report must be an object",
    );
  });

  it("rejects unsupported checkpoint verification output formats", () => {
    expect(() => formatCheckpointVerifyCliOutput(REPORT, "text" as never)).toThrow(
      "Checkpoint verification output format must be json or summary",
    );
  });

  it("rejects malformed checkpoint verification report paths", () => {
    expect(() => formatCheckpointVerifyCliOutput({ ...REPORT, checkpoint: "  " }, "summary")).toThrow(
      "Checkpoint verification report checkpoint must not be empty",
    );
    expect(() => formatCheckpointVerifyCliOutput({ ...REPORT, manifest: 7 } as never, "summary")).toThrow(
      "Checkpoint verification report manifest must be a string",
    );
  });

  it("rejects malformed checkpoint verification report states", () => {
    expect(() => formatCheckpointVerifyCliOutput({ ...REPORT, requireRunUrl: "true" } as never, "json")).toThrow(
      "Checkpoint verification report requireRunUrl must be a boolean",
    );
    expect(() => formatCheckpointVerifyCliOutput({ ...REPORT, passed: "false" } as never, "json")).toThrow(
      "Checkpoint verification report passed must be a boolean",
    );
  });

  it("rejects malformed checkpoint verification failures", () => {
    expect(() => formatCheckpointVerifyCliOutput({ ...REPORT, failures: "failure" } as never, "summary")).toThrow(
      "Checkpoint verification report failures must be an array",
    );
    expect(() => formatCheckpointVerifyCliOutput({ ...REPORT, failures: ["  "] }, "summary")).toThrow(
      "Checkpoint verification report failure 0 must not be empty",
    );
  });
});

describe("isCheckpointVerifyDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./checkpointVerify.js") as CheckpointVerifyCliModule;
    const scriptPath = resolve("runtime/cli/base/checkpointVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isCheckpointVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isCheckpointVerifyDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isCheckpointVerifyDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/base/checkpoint.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./checkpointVerify.js") as CheckpointVerifyCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/base/checkpointVerify.ts")).href;

    expect(() => module.isCheckpointVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(() => module.isCheckpointVerifyDirectRun?.(
      moduleUrl,
      ["node", 123] as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseCheckpointVerifyCliArgs", () => {
  it("requires a checkpoint path", async () => {
    const module = await import("./checkpointVerify.js") as CheckpointVerifyCliModule;

    expect(() => module.parseCheckpointVerifyCliArgs?.([])).toThrow("--checkpoint is required");
  });

  it("parses split and equals-form verification flags", async () => {
    const module = await import("./checkpointVerify.js") as CheckpointVerifyCliModule;

    expect(module.parseCheckpointVerifyCliArgs?.([
      "--checkpoint",
      "artifacts/checkpoint.json",
      "--manifest=deployments/base-sepolia/latest.json",
      "--require-run-url",
      "--format",
      "summary",
    ])).toEqual({
      checkpointPath: "artifacts/checkpoint.json",
      manifestPath: "deployments/base-sepolia/latest.json",
      requireRunUrl: true,
      format: "summary",
    });
  });

  it("rejects duplicate, missing, unsupported, and invalid format arguments", async () => {
    const module = await import("./checkpointVerify.js") as CheckpointVerifyCliModule;

    expect(() => module.parseCheckpointVerifyCliArgs?.([
      "--checkpoint",
      "a.json",
      "--checkpoint",
      "b.json",
    ])).toThrow("Duplicate argument: --checkpoint");
    expect(() => module.parseCheckpointVerifyCliArgs?.(["--checkpoint"])).toThrow("--checkpoint requires a value");
    expect(() => module.parseCheckpointVerifyCliArgs?.(["--manifest", "--format"])).toThrow(
      "--manifest requires a value",
    );
    expect(() => module.parseCheckpointVerifyCliArgs?.(["--checkpoint", "a.json", "--require-run-url", "--require-run-url"])).toThrow(
      "Duplicate argument: --require-run-url",
    );
    expect(() => module.parseCheckpointVerifyCliArgs?.(["--checkpoint", "a.json", "--format", "text"])).toThrow(
      "--format must be json or summary",
    );
    expect(() => module.parseCheckpointVerifyCliArgs?.(["--checkpoint", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runCheckpointVerifyCli", () => {
  async function runWithInjectedVerification(
    verification: unknown,
    calls: string[] = [],
  ): Promise<void> {
    const module = await import("./checkpointVerify.js") as CheckpointVerifyCliModule;

    await module.runCheckpointVerifyCli?.({
      argv: ["--checkpoint", "artifacts/checkpoint.json"],
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      readCheckpoint: async () => CHECKPOINT,
      readManifestText: async () => {
        calls.push("manifest");
        return "{}";
      },
      verifyCheckpoint: () => verification as ReadinessCheckpointVerification,
    });
  }

  it("formats injected verification reports as JSON without reading manifests", async () => {
    const module = await import("./checkpointVerify.js") as CheckpointVerifyCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runCheckpointVerifyCli?.({
      argv: ["--checkpoint", "artifacts/checkpoint.json"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readCheckpoint: async (path) => {
        calls.push(`checkpoint:${path}`);
        return CHECKPOINT;
      },
      readManifestText: async () => {
        throw new Error("readManifestText should not be called");
      },
      verifyCheckpoint: (checkpoint, params) => {
        calls.push(`verify:${params?.manifestContents ?? ""}:${params?.requireRunUrl === true}`);
        expect(checkpoint).toBe(CHECKPOINT);
        return {
          passed: true,
          failures: [],
        };
      },
    });

    expect(outputs).toEqual([formatCheckpointVerifyCliOutput(PASSED_REPORT, "json")]);
    expect(calls).toEqual(["checkpoint:artifacts/checkpoint.json", "verify::false"]);
  });

  it("reads manifest text when requested and formats summary output", async () => {
    const module = await import("./checkpointVerify.js") as CheckpointVerifyCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runCheckpointVerifyCli?.({
      argv: [
        "--checkpoint",
        "artifacts/base-sepolia-readiness-checkpoint.json",
        "--manifest",
        "deployments/base-sepolia/latest.json",
        "--require-run-url",
        "--format",
        "summary",
      ],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => calls.push(`exit:${code}`),
      readCheckpoint: async (path) => {
        calls.push(`checkpoint:${path}`);
        return CHECKPOINT;
      },
      readManifestText: async (path) => {
        calls.push(`manifest:${path}`);
        return "{\"network\":\"base-sepolia\"}";
      },
      verifyCheckpoint: (_checkpoint, params) => {
        calls.push(`verify:${params?.manifestContents ?? ""}:${params?.requireRunUrl === true}`);
        return REPORT;
      },
    });

    expect(outputs).toEqual([formatCheckpointVerifyCliOutput(REPORT, "summary")]);
    expect(calls).toEqual([
      "checkpoint:artifacts/base-sepolia-readiness-checkpoint.json",
      "manifest:deployments/base-sepolia/latest.json",
      "verify:{\"network\":\"base-sepolia\"}:true",
      "exit:1",
    ]);
  });

  it("rejects malformed injected verification reports before output or exit-code mutation", async () => {
    const calls: string[] = [];

    await expect(runWithInjectedVerification(null, calls)).rejects.toThrow(
      "Checkpoint verification report must be an object",
    );
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected verification pass states before output or exit-code mutation", async () => {
    const calls: string[] = [];

    await expect(runWithInjectedVerification({ passed: "false", failures: [] }, calls)).rejects.toThrow(
      "Checkpoint verification report passed must be a boolean",
    );
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected verification failures before output or exit-code mutation", async () => {
    const calls: string[] = [];

    await expect(runWithInjectedVerification({ passed: false, failures: [7] }, calls)).rejects.toThrow(
      "Checkpoint verification report failure 0 must be a string",
    );
    expect(calls).toEqual([]);
  });

  it("rejects malformed arguments before checkpoint or manifest reads", async () => {
    const module = await import("./checkpointVerify.js") as CheckpointVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runCheckpointVerifyCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readCheckpoint: async () => {
        calls.push("checkpoint");
        return CHECKPOINT;
      },
      readManifestText: async () => {
        calls.push("manifest");
        return "{}";
      },
      verifyCheckpoint: () => {
        calls.push("verify");
        return REPORT;
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
