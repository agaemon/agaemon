import { describe, expect, it } from "vitest";

import { verifyMemoryStorageMigration } from "./storageMigration.js";

const BASE_RECORD = {
  publisher: "local",
  memoryId: `0x${"11".repeat(32)}` as const,
  merkleRoot: `0x${"22".repeat(32)}` as const,
  contentHash: `0x${"22".repeat(32)}` as const,
  storageURIHash: `0x${"33".repeat(32)}` as const,
  storageURI: `memory://local/0x${"22".repeat(32)}`,
};

const BASE_BINDING = {
  schemaVersion: 1,
  deploymentManifest: {
    path: "deployments/base-sepolia/latest.json",
    sha256: "manifest-hash",
  },
  memoryIdLabel: "agentos.memory.migration",
  record: BASE_RECORD,
  verification: { ok: true },
} as const;

describe("verifyMemoryStorageMigration", () => {
  it("accepts migration when memory identity and content hashes are preserved", () => {
    expect(
      verifyMemoryStorageMigration({
        from: BASE_BINDING,
        to: {
          ...BASE_BINDING,
          record: {
            ...BASE_RECORD,
            publisher: "ipfs",
            storageURI: "ipfs://bafymemory",
            storageURIHash: `0x${"44".repeat(32)}`,
          },
        },
      }),
    ).toEqual({
      passed: true,
      failures: [],
    });
  });

  it("rejects migration when content hash changes", () => {
    expect(
      verifyMemoryStorageMigration({
        from: BASE_BINDING,
        to: {
          ...BASE_BINDING,
          record: {
            ...BASE_RECORD,
            contentHash: `0x${"55".repeat(32)}`,
          },
        },
      }),
    ).toEqual({
      passed: false,
      failures: ["memory migration content hash changed"],
    });
  });

  it("rejects migration when memory identity changes", () => {
    expect(
      verifyMemoryStorageMigration({
        from: BASE_BINDING,
        to: {
          ...BASE_BINDING,
          memoryIdLabel: "agentos.memory.other",
          record: {
            ...BASE_RECORD,
            memoryId: `0x${"66".repeat(32)}`,
          },
        },
      }),
    ).toEqual({
      passed: false,
      failures: [
        "memory migration label changed",
        "memory migration memory ID changed",
      ],
    });
  });

  it("rejects migration when either binding is unverified", () => {
    expect(
      verifyMemoryStorageMigration({
        from: {
          ...BASE_BINDING,
          verification: { ok: false },
        },
        to: BASE_BINDING,
      }),
    ).toEqual({
      passed: false,
      failures: ["source memory binding must be verified"],
    });
  });
});
