import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createMemoryStorageBinding,
  verifyMemoryStorageBinding,
} from "./storageBinding.js";
import {
  createLocalMemoryStorageAdapter,
  storeAndVerifyMemoryRecord,
} from "./storageAdapter.js";

const DEPLOYMENT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const DEPLOYMENT_MANIFEST_JSON = JSON.stringify({
  network: "base-sepolia",
  chainId: 84532,
  contracts: {
    memoryRegistry: "0x0000000000000000000000000000000000000c01",
  },
});

describe("memory storage binding", () => {
  it("binds a verified stored memory record to deployment manifest evidence", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "agentos-memory-binding-"));
    const adapter = createLocalMemoryStorageAdapter({ rootDir });
    const verification = await storeAndVerifyMemoryRecord({
      adapter,
      memoryIdLabel: "agentos.memory.binding",
      content: "AgentOS storage binding content",
    });

    const binding = createMemoryStorageBinding({
      deploymentManifestPath: DEPLOYMENT_MANIFEST_PATH,
      deploymentManifestJson: DEPLOYMENT_MANIFEST_JSON,
      memoryIdLabel: "agentos.memory.binding",
      verification,
    });

    expect(binding.schemaVersion).toBe(1);
    expect(binding.deploymentManifest.path).toBe(DEPLOYMENT_MANIFEST_PATH);
    expect(binding.record.storageURI).toBe(verification.record.storageURI);
    expect(binding.record.contentHash).toBe(verification.record.contentHash);
    expect(binding.verification.ok).toBe(true);
    expect(verifyMemoryStorageBinding({
      binding,
      deploymentManifestJson: DEPLOYMENT_MANIFEST_JSON,
      verification,
    })).toEqual({
      passed: true,
      failures: [],
    });
  });

  it("rejects stale deployment manifest evidence", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "agentos-memory-binding-"));
    const adapter = createLocalMemoryStorageAdapter({ rootDir });
    const verification = await storeAndVerifyMemoryRecord({
      adapter,
      memoryIdLabel: "agentos.memory.binding",
      content: "AgentOS storage binding content",
    });
    const binding = createMemoryStorageBinding({
      deploymentManifestPath: DEPLOYMENT_MANIFEST_PATH,
      deploymentManifestJson: DEPLOYMENT_MANIFEST_JSON,
      memoryIdLabel: "agentos.memory.binding",
      verification,
    });

    expect(verifyMemoryStorageBinding({
      binding,
      deploymentManifestJson: JSON.stringify({ network: "base-sepolia", chainId: 84532, changed: true }),
      verification,
    })).toEqual({
      passed: false,
      failures: ["deployment manifest hash does not match storage binding"],
    });
  });

  it("rejects bindings created from failed storage verification", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "agentos-memory-binding-"));
    const adapter = createLocalMemoryStorageAdapter({ rootDir });
    const verification = await storeAndVerifyMemoryRecord({
      adapter,
      memoryIdLabel: "agentos.memory.binding",
      content: "AgentOS storage binding content",
    });
    const binding = {
      ...createMemoryStorageBinding({
        deploymentManifestPath: DEPLOYMENT_MANIFEST_PATH,
        deploymentManifestJson: DEPLOYMENT_MANIFEST_JSON,
        memoryIdLabel: "agentos.memory.binding",
        verification,
      }),
      verification: { ok: false },
    };

    expect(verifyMemoryStorageBinding({
      binding,
      deploymentManifestJson: DEPLOYMENT_MANIFEST_JSON,
      verification,
    })).toEqual({
      passed: false,
      failures: ["storage binding verification must be ok"],
    });
  });
});
