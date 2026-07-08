import { describe, expect, it } from "vitest";

import type {
  MemoryStorageMigrationVerification,
} from "../../memory/storageMigration.js";
import type {
  MemoryStorageBinding,
} from "../../memory/storageBinding.js";
import {
  type MemoryStorageMigrationVerifyCliReport,
  formatMemoryStorageMigrationVerifyCliOutput,
  parseMemoryStorageMigrationVerifyCliArgs,
  runMemoryStorageMigrationVerifyCli,
} from "./storageMigrationVerify.js";

const SOURCE_RECORD = {
  publisher: "local",
  memoryId: `0x${"11".repeat(32)}` as const,
  merkleRoot: `0x${"22".repeat(32)}` as const,
  contentHash: `0x${"33".repeat(32)}` as const,
  storageURIHash: `0x${"44".repeat(32)}` as const,
  storageURI: `memory://local/0x${"33".repeat(32)}`,
};

const TARGET_RECORD = {
  ...SOURCE_RECORD,
  publisher: "ipfs",
  storageURI: "ipfs://bafyagentosmemory",
  storageURIHash: `0x${"55".repeat(32)}` as const,
};

const SOURCE_BINDING: MemoryStorageBinding = {
  schemaVersion: 1,
  deploymentManifest: {
    path: "deployments/base-sepolia/latest.json",
    sha256: "source-manifest-sha",
  },
  memoryIdLabel: "agentos.memory.migration",
  record: SOURCE_RECORD,
  verification: { ok: true },
};

const TARGET_BINDING: MemoryStorageBinding = {
  ...SOURCE_BINDING,
  deploymentManifest: {
    path: "deployments/base-sepolia/latest.json",
    sha256: "target-manifest-sha",
  },
  record: TARGET_RECORD,
};

const SOURCE_REPORT = {
  schemaVersion: 1,
  manifestPath: "deployments/base-sepolia/latest.json",
  storageDir: "storage/memory",
  memoryIdLabel: "agentos.memory.migration",
  binding: SOURCE_BINDING,
  verification: { passed: true, failures: [] },
};

const TARGET_REPORT = {
  ...SOURCE_REPORT,
  storageDir: "storage/migrated-memory",
  binding: TARGET_BINDING,
};

describe("parseMemoryStorageMigrationVerifyCliArgs", () => {
  it("parses source, target, output, and format flags", () => {
    expect(parseMemoryStorageMigrationVerifyCliArgs([
      "--from",
      "artifacts/source-binding.json",
      "--to=artifacts/target-binding.json",
      "--output",
      "artifacts/memory-storage-migration-verification.json",
      "--format",
      "summary",
    ])).toEqual({
      fromPath: "artifacts/source-binding.json",
      toPath: "artifacts/target-binding.json",
      outputPath: "artifacts/memory-storage-migration-verification.json",
      format: "summary",
    });
  });

  it("rejects duplicate and unsupported flags", () => {
    expect(() => parseMemoryStorageMigrationVerifyCliArgs(["--from", "a.json", "--from", "b.json"]))
      .toThrow("Duplicate argument: --from");
    expect(() => parseMemoryStorageMigrationVerifyCliArgs(["--send"])).toThrow("Unsupported argument: --send");
  });
});

describe("runMemoryStorageMigrationVerifyCli", () => {
  it("verifies migration between two saved binding reports without RPC or PRIVATE_KEY", async () => {
    const outputs: string[] = [];
    const writes: unknown[] = [];
    const env: Record<string, string | undefined> = {};
    const verifyCalls: unknown[] = [];

    await runMemoryStorageMigrationVerifyCli({
      argv: [
        "--from",
        "artifacts/source-binding.json",
        "--to",
        "artifacts/target-binding.json",
        "--output",
        "artifacts/memory-storage-migration-verification.json",
        "--format",
        "summary",
      ],
      env,
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => path.includes("source") ? JSON.stringify(SOURCE_REPORT) : JSON.stringify(TARGET_REPORT),
      writeText: async (path, contents) => { writes.push({ path, contents }); },
      verifyMigration: (params) => {
        verifyCalls.push(params);
        return { passed: true, failures: [] };
      },
    });

    const report = JSON.parse((writes[0] as { contents: string }).contents) as MemoryStorageMigrationVerifyCliReport;
    expect(verifyCalls).toEqual([{ from: SOURCE_BINDING, to: TARGET_BINDING }]);
    expect(report).toMatchObject({
      schemaVersion: 1,
      fromPath: "artifacts/source-binding.json",
      toPath: "artifacts/target-binding.json",
      passed: true,
      failures: [],
      verification: { passed: true, failures: [] },
    });
    expect(writes).toEqual([
      {
        path: "artifacts/memory-storage-migration-verification.json",
        contents: `${JSON.stringify(report, null, 2)}\n`,
      },
    ]);
    expect(outputs[0]).toContain("overall: passed");
    expect(outputs[0]).toContain("from: artifacts/source-binding.json");
    expect(outputs[0]).toContain("to: artifacts/target-binding.json");
    expect(env.BASE_SEPOLIA_RPC_URL).toBeUndefined();
    expect(env.PRIVATE_KEY).toBeUndefined();
  });

  it("sets exit code when migration verification fails", async () => {
    const outputs: string[] = [];
    let exitCode: number | undefined;
    const failed: MemoryStorageMigrationVerification = {
      passed: false,
      failures: ["memory migration content hash changed"],
    };

    await runMemoryStorageMigrationVerifyCli({
      argv: ["--from", "source.json", "--to", "target.json", "--format", "summary"],
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => path.includes("source") ? JSON.stringify(SOURCE_REPORT) : JSON.stringify(TARGET_REPORT),
      verifyMigration: () => failed,
      setExitCode: (code) => { exitCode = code; },
    });

    expect(exitCode).toBe(1);
    expect(outputs[0]).toContain("overall: failed");
    expect(outputs[0]).toContain("failure: memory migration content hash changed");
  });
});

describe("formatMemoryStorageMigrationVerifyCliOutput", () => {
  it("formats JSON and summary reports", () => {
    const report: MemoryStorageMigrationVerifyCliReport = {
      schemaVersion: 1,
      fromPath: "artifacts/source-binding.json",
      toPath: "artifacts/target-binding.json",
      passed: true,
      failures: [],
      from: SOURCE_BINDING,
      to: TARGET_BINDING,
      verification: { passed: true, failures: [] },
    };

    expect(formatMemoryStorageMigrationVerifyCliOutput(report, "json")).toContain("\"passed\": true");
    expect(formatMemoryStorageMigrationVerifyCliOutput(report, "summary")).toContain("overall: passed");
  });
});
