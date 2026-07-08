import { describe, expect, it } from "vitest";

import type {
  MemoryStorageBinding,
} from "../../memory/storageBinding.js";
import type {
  MemoryStorageAdapter,
  StoredMemoryRecordVerificationResult,
} from "../../memory/storageAdapter.js";
import {
  type MemoryStorageBindingVerifyCliReport,
  formatMemoryStorageBindingVerifyCliOutput,
  parseMemoryStorageBindingVerifyCliArgs,
  runMemoryStorageBindingVerifyCli,
} from "./storageBindingVerify.js";

const RECORD = {
  publisher: "local" as const,
  memoryId: `0x${"11".repeat(32)}` as const,
  merkleRoot: `0x${"22".repeat(32)}` as const,
  contentHash: `0x${"33".repeat(32)}` as const,
  storageURIHash: `0x${"44".repeat(32)}` as const,
  storageURI: `memory://local/0x${"33".repeat(32)}`,
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

const BINDING_REPORT = {
  schemaVersion: 1,
  manifestPath: "deployments/base-sepolia/latest.json",
  storageDir: "storage/memory",
  memoryIdLabel: "agentos.memory.binding",
  binding: BINDING,
  verification: { passed: true, failures: [] },
};

describe("parseMemoryStorageBindingVerifyCliArgs", () => {
  it("parses binding report, manifest override, storage override, and format", () => {
    expect(parseMemoryStorageBindingVerifyCliArgs([
      "--binding", "artifacts/memory-binding.json",
      "--manifest=deployments/base-sepolia/custom.json",
      "--storage-dir", "tmp/memory",
      "--output", "artifacts/memory-binding-verification.json",
      "--format", "summary",
    ])).toEqual({
      bindingPath: "artifacts/memory-binding.json",
      manifestPath: "deployments/base-sepolia/custom.json",
      storageDir: "tmp/memory",
      outputPath: "artifacts/memory-binding-verification.json",
      format: "summary",
    });
  });

  it("rejects duplicate and unsupported flags", () => {
    expect(() => parseMemoryStorageBindingVerifyCliArgs(["--binding", "a.json", "--binding", "b.json"]))
      .toThrow("Duplicate argument: --binding");
    expect(() => parseMemoryStorageBindingVerifyCliArgs(["--send"])).toThrow("Unsupported argument: --send");
  });
});

describe("runMemoryStorageBindingVerifyCli", () => {
  it("re-verifies a saved local memory storage binding report", async () => {
    const outputs: string[] = [];
    const writes: string[] = [];
    const adapters: string[] = [];
    const verifyStoredCalls: unknown[] = [];
    const verifyBindingCalls: unknown[] = [];

    await runMemoryStorageBindingVerifyCli({
      argv: ["--format", "summary", "--output", "artifacts/memory-binding-verification.json"],
      writeOutput: (output) => outputs.push(output),
      mkdirp: async (path) => { writes.push(`mkdir:${path}`); },
      writeText: async (path, contents) => { writes.push(`write:${path}:${JSON.parse(contents).passed}`); },
      readText: async (path) => path.endsWith("latest.json")
        ? JSON.stringify({ chainId: 84532 })
        : JSON.stringify(BINDING_REPORT),
      createAdapter: (rootDir): MemoryStorageAdapter => {
        adapters.push(rootDir);
        return {
          name: "local",
          store: async () => RECORD,
          retrieve: async () => STORAGE_VERIFICATION.content,
        };
      },
      verifyStored: async (params) => {
        verifyStoredCalls.push(params);
        return STORAGE_VERIFICATION;
      },
      verifyBinding: (params) => {
        verifyBindingCalls.push(params);
        return { passed: true, failures: [] };
      },
    });

    expect(adapters).toEqual(["storage/memory"]);
    expect(verifyStoredCalls[0]).toMatchObject({
      memoryIdLabel: "agentos.memory.binding",
      record: RECORD,
    });
    expect(verifyBindingCalls[0]).toMatchObject({
      binding: BINDING,
      verification: STORAGE_VERIFICATION,
    });
    expect(outputs[0]).toContain("overall: passed");
    expect(outputs[0]).toContain("artifacts/memory-storage-binding.json");
    expect(writes).toEqual([
      "mkdir:artifacts",
      "write:artifacts/memory-binding-verification.json:true",
    ]);
  });

  it("fails closed when stored content verification fails", async () => {
    const outputs: string[] = [];
    let exitCode: number | undefined;

    await runMemoryStorageBindingVerifyCli({
      argv: ["--format", "summary"],
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => path.endsWith("latest.json")
        ? JSON.stringify({ chainId: 84532 })
        : JSON.stringify(BINDING_REPORT),
      createAdapter: (): MemoryStorageAdapter => ({
        name: "local",
        store: async () => RECORD,
        retrieve: async () => STORAGE_VERIFICATION.content,
      }),
      verifyStored: async () => {
        throw new Error("Unable to retrieve stored memory content: missing file");
      },
      verifyBinding: () => ({ passed: true, failures: [] }),
      setExitCode: (code) => { exitCode = code; },
    });

    expect(exitCode).toBe(1);
    expect(outputs[0]).toContain("overall: failed");
    expect(outputs[0]).toContain("Unable to retrieve stored memory content: missing file");
  });
});

describe("formatMemoryStorageBindingVerifyCliOutput", () => {
  it("formats JSON and summary verification reports", () => {
    const report: MemoryStorageBindingVerifyCliReport = {
      schemaVersion: 1,
      bindingPath: "artifacts/memory-storage-binding.json",
      manifestPath: "deployments/base-sepolia/latest.json",
      storageDir: "storage/memory",
      passed: true,
      failures: [],
      bindingVerification: { passed: true, failures: [] },
    };

    expect(formatMemoryStorageBindingVerifyCliOutput(report, "json")).toContain("\"passed\": true");
    expect(formatMemoryStorageBindingVerifyCliOutput(report, "summary")).toContain("overall: passed");
  });
});
