import { describe, expect, it } from "vitest";

import type {
  MemoryStorageBinding,
  MemoryStorageBindingVerification,
} from "../../memory/storageBinding.js";
import type {
  MemoryStorageAdapter,
  StoredMemoryRecordVerificationResult,
} from "../../memory/storageAdapter.js";
import {
  type MemoryStorageBindingCliReport,
  formatMemoryStorageBindingCliOutput,
  parseMemoryStorageBindingCliArgs,
  runMemoryStorageBindingCli,
} from "./storageBinding.js";

const RECORD = {
  publisher: "local" as const,
  memoryId: `0x${"11".repeat(32)}` as const,
  merkleRoot: `0x${"22".repeat(32)}` as const,
  contentHash: `0x${"33".repeat(32)}` as const,
  storageURIHash: `0x${"44".repeat(32)}` as const,
  storageURI: `memory://local/0x${"33".repeat(32)}`,
  filePath: `storage/memory/0x${"33".repeat(32)}.txt`,
};

const STORAGE_VERIFICATION: StoredMemoryRecordVerificationResult = {
  ok: true,
  record: RECORD,
  content: "AgentOS storage binding content",
  verification: {
    ok: true,
    computed: RECORD,
    expected: RECORD,
    checks: {
      memoryIdMatches: true,
      merkleRootMatches: true,
      contentHashMatches: true,
      storageURIHashMatches: true,
    },
  },
};

const BINDING: MemoryStorageBinding = {
  schemaVersion: 1,
  deploymentManifest: {
    path: "deployments/base-sepolia/latest.json",
    sha256: "manifest-sha",
  },
  memoryIdLabel: "agentos.memory.binding",
  record: RECORD,
  verification: { ok: true },
};

describe("parseMemoryStorageBindingCliArgs", () => {
  it("parses manifest, storage, output, and format flags", () => {
    expect(parseMemoryStorageBindingCliArgs([
      "--manifest", "deployments/base-sepolia/custom.json",
      "--storage-dir=tmp/memory",
      "--memory-id-label", "agentos.memory.demo",
      "--content=demo content",
      "--output", "artifacts/memory-binding.json",
      "--format", "summary",
    ])).toEqual({
      manifestPath: "deployments/base-sepolia/custom.json",
      storageDir: "tmp/memory",
      memoryIdLabel: "agentos.memory.demo",
      content: "demo content",
      outputPath: "artifacts/memory-binding.json",
      format: "summary",
    });
  });

  it("rejects duplicate and unsupported flags", () => {
    expect(() => parseMemoryStorageBindingCliArgs(["--format", "json", "--format", "summary"]))
      .toThrow("Duplicate argument: --format");
    expect(() => parseMemoryStorageBindingCliArgs(["--send"])).toThrow("Unsupported argument: --send");
  });
});

describe("runMemoryStorageBindingCli", () => {
  it("stores and verifies a manifest-bound memory record without RPC or PRIVATE_KEY", async () => {
    const outputs: string[] = [];
    const writes: unknown[] = [];
    const adapters: string[] = [];
    const storeCalls: unknown[] = [];
    const createBindingCalls: unknown[] = [];
    const verifyBindingCalls: unknown[] = [];

    await runMemoryStorageBindingCli({
      argv: [
        "--output", "artifacts/memory-storage-binding.json",
        "--format", "summary",
      ],
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => JSON.stringify({ path, chainId: 84532 }),
      writeText: async (path, contents) => { writes.push({ path, contents }); },
      createAdapter: (rootDir): MemoryStorageAdapter => {
        adapters.push(rootDir);
        return {
          name: "local",
          store: async () => RECORD,
          retrieve: async () => STORAGE_VERIFICATION.content,
        };
      },
      storeAndVerify: async (params) => {
        storeCalls.push(params);
        return STORAGE_VERIFICATION;
      },
      createBinding: (params) => {
        createBindingCalls.push(params);
        return BINDING;
      },
      verifyBinding: (params) => {
        verifyBindingCalls.push(params);
        return { passed: true, failures: [] };
      },
    });

    const report = JSON.parse((writes[0] as { contents: string }).contents);
    expect(adapters).toEqual(["storage/memory"]);
    expect(storeCalls[0]).toMatchObject({
      memoryIdLabel: "agentos.memory.binding-smoke",
      content: "AgentOS memory storage binding smoke test",
    });
    expect(createBindingCalls[0]).toMatchObject({
      deploymentManifestPath: "deployments/base-sepolia/latest.json",
      memoryIdLabel: "agentos.memory.binding-smoke",
    });
    expect(verifyBindingCalls[0]).toMatchObject({
      binding: BINDING,
      verification: STORAGE_VERIFICATION,
    });
    expect(report).toMatchObject({
      schemaVersion: 1,
      manifestPath: "deployments/base-sepolia/latest.json",
      storageDir: "storage/memory",
      memoryIdLabel: "agentos.memory.binding-smoke",
      binding: BINDING,
      verification: { passed: true, failures: [] },
    });
    expect(writes).toEqual([{ path: "artifacts/memory-storage-binding.json", contents: `${JSON.stringify(report, null, 2)}\n` }]);
    expect(outputs[0]).toContain("overall: passed");
    expect(outputs[0]).toContain(RECORD.storageURI);
  });

  it("sets exit code when binding verification fails", async () => {
    let exitCode: number | undefined;
    const failed: MemoryStorageBindingVerification = {
      passed: false,
      failures: ["deployment manifest hash does not match storage binding"],
    };

    await runMemoryStorageBindingCli({
      argv: ["--format", "summary"],
      writeOutput: () => {},
      readText: async () => "{}",
      createAdapter: (): MemoryStorageAdapter => ({
        name: "local",
        store: async () => RECORD,
        retrieve: async () => STORAGE_VERIFICATION.content,
      }),
      storeAndVerify: async () => STORAGE_VERIFICATION,
      createBinding: () => BINDING,
      verifyBinding: () => failed,
      setExitCode: (code) => { exitCode = code; },
    });

    expect(exitCode).toBe(1);
  });
});

describe("formatMemoryStorageBindingCliOutput", () => {
  it("formats JSON and summary reports", () => {
    const report: MemoryStorageBindingCliReport = {
      schemaVersion: 1,
      manifestPath: "deployments/base-sepolia/latest.json",
      storageDir: "storage/memory",
      memoryIdLabel: "agentos.memory.binding",
      binding: BINDING,
      verification: { passed: true, failures: [] },
    };

    expect(formatMemoryStorageBindingCliOutput(report, "json")).toContain("\"passed\": true");
    expect(formatMemoryStorageBindingCliOutput(report, "summary")).toContain("overall: passed");
  });
});
