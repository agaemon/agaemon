import { describe, expect, it } from "vitest";

import { formatDeploymentManifestVerifySummary } from "./manifestVerifier.js";

import type { DeploymentManifestVerifyReport } from "./manifestVerifier.js";

const PASSING_REPORT: DeploymentManifestVerifyReport = {
  network: "base-sepolia",
  chainId: {
    expected: 84532,
    actual: 84532,
    passed: true,
  },
  contracts: [
    {
      name: "capabilityRegistry",
      address: "0x0000000000000000000000000000000000001001",
      deployed: true,
      bytecodeBytes: 2,
      passed: true,
    },
    {
      name: "policyEngine",
      address: "0x0000000000000000000000000000000000001002",
      deployed: true,
      bytecodeBytes: 2,
      passed: true,
    },
  ],
  transactions: [
    {
      name: "deployCapabilityRegistry",
      hash: "0x1111111111111111111111111111111111111111111111111111111111111111",
      status: "success",
      blockNumber: "123",
      contractAddress: "0x0000000000000000000000000000000000001001",
      expectedContract: {
        name: "capabilityRegistry",
        address: "0x0000000000000000000000000000000000001001",
        matches: true,
      },
      passed: true,
    },
    {
      name: "setCapability",
      hash: "0x2222222222222222222222222222222222222222222222222222222222222222",
      status: "success",
      blockNumber: "124",
      contractAddress: null,
      passed: true,
    },
  ],
  summary: {
    contractCount: 2,
    transactionCount: 2,
    failedChecks: 0,
    passed: true,
  },
};

const FAILING_REPORT: DeploymentManifestVerifyReport = {
  ...PASSING_REPORT,
  chainId: {
    expected: 84532,
    actual: 84531,
    passed: false,
  },
  summary: {
    contractCount: 2,
    transactionCount: 2,
    failedChecks: 2,
    passed: false,
  },
};

describe("deployment manifest verifier summary fixtures", () => {
  it("renders a reproducible passing manifest verification summary", () => {
    expect(formatDeploymentManifestVerifySummary(PASSING_REPORT)).toBe([
      "Base Sepolia manifest verification",
      "network: base-sepolia",
      "chainId: 84532",
      "contracts: 2",
      "transactions: 2",
      "failedChecks: 0",
      "passed: true",
    ].join("\n"));
  });

  it("keeps failed manifest verification evidence readable", () => {
    expect(formatDeploymentManifestVerifySummary(FAILING_REPORT)).toBe([
      "Base Sepolia manifest verification",
      "network: base-sepolia",
      "chainId: 84531",
      "contracts: 2",
      "transactions: 2",
      "failedChecks: 2",
      "passed: false",
    ].join("\n"));
  });
});
