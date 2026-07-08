import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBroadcastReceipt } from "./receipt.js";

const GENERATED_AT = "2026-06-25T10:00:00.000Z";
const BROADCAST_PACKAGE_PATH = "artifacts/example-agent-proposal-execution-broadcast-package.json";
const SIGNER = "0x0000000000000000000000000000000000000d01";
const TX_HASH = `0x${"34".repeat(32)}` as const;

const BROADCAST_PACKAGE = {
  schemaVersion: 1,
  generatedAt: GENERATED_AT,
  signer: SIGNER,
  chainId: 84532,
  nonceStart: 7,
  pendingNonce: 7,
  transactions: [
    {
      index: 0,
      rawTransaction: "0x1234",
    },
  ],
};

describe("createAgentProposalExecutionBroadcastReceipt", () => {
  it("creates a receipt artifact from a successful send result", () => {
    const broadcastPackageJson = JSON.stringify(BROADCAST_PACKAGE, null, 2);
    const result = createAgentProposalExecutionBroadcastReceipt({
      broadcastPackagePath: BROADCAST_PACKAGE_PATH,
      broadcastPackageJson,
      submitResult: {
        mode: "send",
        passed: true,
        failures: [],
        broadcastPackage: BROADCAST_PACKAGE_PATH,
        signer: SIGNER,
        chainId: 84532,
        transactions: 1,
        submitted: [
          {
            index: 0,
            hash: TX_HASH,
            blockNumber: "999",
            status: "success",
          },
        ],
      },
      generatedAt: GENERATED_AT,
    });

    expect(result).toEqual({
      passed: true,
      failures: [],
      receipt: {
        schemaVersion: 1,
        generatedAt: GENERATED_AT,
        broadcastPackage: {
          path: BROADCAST_PACKAGE_PATH,
          sha256: sha256(broadcastPackageJson),
        },
        signer: SIGNER,
        chainId: 84532,
        transactions: [
          {
            index: 0,
            hash: TX_HASH,
            blockNumber: "999",
            status: "success",
          },
        ],
      },
    });
  });

  it("rejects dry-run submit results", () => {
    const result = createAgentProposalExecutionBroadcastReceipt({
      broadcastPackagePath: BROADCAST_PACKAGE_PATH,
      broadcastPackageJson: JSON.stringify(BROADCAST_PACKAGE, null, 2),
      submitResult: {
        mode: "dry-run",
        passed: true,
        failures: [],
        broadcastPackage: BROADCAST_PACKAGE_PATH,
        signer: SIGNER,
        chainId: 84532,
        transactions: 1,
        submitted: [],
      },
      generatedAt: GENERATED_AT,
    });

    expect(result).toEqual({
      passed: false,
      failures: ["broadcast receipt requires a successful send result"],
      receipt: null,
    });
  });
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
