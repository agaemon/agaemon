import { describe, expect, it } from "vitest";

import { createSmokeTestAction, normalizePrivateKey, policyDecisionFromCode } from "./execution.js";
import { parseDeploymentManifest } from "./deploymentManifest.js";

const MANIFEST = parseDeploymentManifest({
  network: "base-sepolia",
  chainId: 84532,
  rpcUrlEnv: "BASE_SEPOLIA_RPC_URL",
  explorerUrl: "https://sepolia.basescan.org",
  owner: "0x3124475af0ba367fFf33a5DC9BcE78c41f493713",
  contracts: {
    capabilityRegistry: "0x056A0743799429d9b5aE6c5E97ffA2d056293745",
    policyEngine: "0x33a5BbD1Dc0cCBCc59d57bd0c434ce3a3F2660Cd",
    reputationRegistry: "0x75790a9523c4d80cB22424B6b5Dd993A4cf1A64a",
    agentAccount: "0x3248c014d9f235007568A165f2bBE09cAC98d92C",
    testTargetProtocol: "0xEc31F79d32CE88D53895D0EDE3ed757860062b3a",
  },
  transactions: {
    deployCapabilityRegistry: "0x2b944445acfb5970b3435301c4dd5762582f4ca940a1d9eb7b20be0e7ea3e31d",
    deployPolicyEngine: "0x27fd7c2b5abf5a11e105484e04e565827775b7b9afe0852d29ac4e3006905798",
    deployReputationRegistry: "0x782dafbbc94eeb6bca588721d6b31ced2f5f7d8e1068a691aa8cf61a2c066fd6",
    deployAgentAccount: "0x363c246d7bc254b9e9ec80ddb2dcab5d326e61abae02d13304c6b7dc277da88f",
    deployTestTargetProtocol: "0xbc2f95638181489d8ed4a39882394f1a131b77a6ca2096fe35ed4a1f34e2b963",
    setCapability: "0xbb2367a359f99a4c29a99b2725a9ddee4eb423bd79286747715e2fbc2012611e",
    setPolicy: "0xf25c0be494620ba99c1d3d58a8a7a9bfb1f42a84068ebe77d3e4b315697e3e1c",
    smokeExecute: "0x1aebab9b5f7b097257426104d71010124dac176a99e163e5f721695f5215dcfa",
  },
  smokeTest: {
    capability: "0x497a7733c30c446bed91d579fce5ede8c3e0fbcdbe90a491d0a07e91d5b88b71",
    targetWasCalled: true,
  },
});

describe("base execution", () => {
  it("creates the manifest-backed smoke-test action", () => {
    const action = createSmokeTestAction(MANIFEST);

    expect(action.capability).toBe(MANIFEST.smokeTest.capability);
    expect(action.target).toBe(MANIFEST.contracts.testTargetProtocol);
    expect(action.data).toBe("0x8c0d0c29");
    expect(action.value).toBe(0n);
    expect(action.usesBorrowing).toBe(false);
  });

  it("maps policy decision codes from the contract enum", () => {
    expect(policyDecisionFromCode(0)).toEqual({ allowed: true, code: "Allowed" });
    expect(policyDecisionFromCode(2)).toEqual({ allowed: false, code: "CapabilityDenied" });
  });

  it("rejects malformed policy decision code inputs before enum lookup", () => {
    for (const code of [Number.NaN, Number.POSITIVE_INFINITY, 1.5, -1, 256]) {
      expect(() => policyDecisionFromCode(code)).toThrow("Invalid policy decision code");
    }

    expect(() => policyDecisionFromCode(99)).toThrow("Unknown policy decision code: 99");
  });

  it("normalizes private keys with and without a hex prefix", () => {
    const key = "1".repeat(64);

    expect(normalizePrivateKey(key)).toBe(`0x${key}`);
    expect(normalizePrivateKey(`0x${key}`)).toBe(`0x${key}`);
  });

  it("normalizes private keys with an uppercase hex prefix", () => {
    const key = "1".repeat(64);

    expect(normalizePrivateKey(`0X${key}`)).toBe(`0x${key}`);
  });

  it("normalizes private keys with surrounding whitespace", () => {
    const key = "1".repeat(64);

    expect(normalizePrivateKey(`  0x${key}\n`)).toBe(`0x${key}`);
  });

  it("normalizes private keys with uppercase hex digits", () => {
    const key = "A".repeat(64);

    expect(normalizePrivateKey(`0x${key}`)).toBe(`0x${key.toLowerCase()}`);
  });
});
