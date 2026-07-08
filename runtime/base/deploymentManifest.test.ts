import { describe, expect, it } from "vitest";

import {
  DEPLOYMENT_AGENT_PROFILE_FIELDS,
  DEPLOYMENT_MANIFEST_CONTRACT_FIELDS,
  DEPLOYMENT_MANIFEST_FIELDS,
  DEPLOYMENT_MANIFEST_OPTIONAL_CONTRACT_FIELDS,
  DEPLOYMENT_MANIFEST_OPTIONAL_FIELDS,
  DEPLOYMENT_MANIFEST_OPTIONAL_TRANSACTION_FIELDS,
  DEPLOYMENT_MANIFEST_REQUIRED_CONTRACT_FIELDS,
  DEPLOYMENT_MANIFEST_REQUIRED_FIELDS,
  DEPLOYMENT_MANIFEST_REQUIRED_TRANSACTION_FIELDS,
  DEPLOYMENT_MANIFEST_SMOKE_TEST_FIELDS,
  DEPLOYMENT_MANIFEST_TRANSACTION_FIELDS,
  parseDeploymentManifest,
  requireAgentCoordination,
  requireCoordinationPayoutReceiptRegistry,
  requireMemoryRegistry,
  requireMockSwapAdapter,
  requireReputationHistory,
  resolveDeploymentAgentProfile,
} from "./deploymentManifest.js";

const VALID_MANIFEST = {
  network: "base-sepolia",
  chainId: 84532,
  rpcUrlEnv: "BASE_SEPOLIA_RPC_URL",
  explorerUrl: "https://sepolia.basescan.org",
  owner: "0x3124475af0ba367fFf33a5DC9BcE78c41f493713",
  agentProfile: {
    roleLabel: "agentos.kernel.operator",
    metadataURI: "ipfs://bafkreidohkf2rz54ulzhl7ffl3bb6xqxt67imopitmfgjcbgghorwvzheq",
  },
  contracts: {
    capabilityRegistry: "0x056A0743799429d9b5aE6c5E97ffA2d056293745",
    policyEngine: "0x33a5BbD1Dc0cCBCc59d57bd0c434ce3a3F2660Cd",
    reputationRegistry: "0x75790a9523c4d80cB22424B6b5Dd993A4cf1A64a",
    agentAccount: "0x3248c014d9f235007568A165f2bBE09cAC98d92C",
    testTargetProtocol: "0xEc31F79d32CE88D53895D0EDE3ed757860062b3a",
    treasuryPaymentAdapter: "0x0000000000000000000000000000000000000c11",
    testErc20Token: "0x0000000000000000000000000000000000000e20",
    mockSwapAdapter: "0x00000000000000000000000000000000000005a0",
    memoryRegistry: "0x0000000000000000000000000000000000000c0f",
    payoutRuleAdapter: "0x0000000000000000000000000000000000000aDA",
    coordinationPayoutReceiptRegistry: "0x000000000000000000000000000000000000a022",
    agentDirectory: "0x0000000000000000000000000000000000000d1a",
    reputationHistory: "0x0000000000000000000000000000000000000b0b",
    agentCoordination: "0x0000000000000000000000000000000000000c00",
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
    deployMockSwapAdapter: "0x3535353535353535353535353535353535353535353535353535353535353535",
    fundMockSwapAdapter: "0x4545454545454545454545454545454545454545454545454545454545454545",
    configureSwapCapability: "0x5555555555555555555555555555555555555555555555555555555555555555",
    configureSwapPolicy: "0x6565656565656565656565656565656565656565656565656565656565656565",
    swapExecute: "0x7575757575757575757575757575757575757575757575757575757575757575",
    deployMemoryRegistry: "0x8585858585858585858585858585858585858585858585858585858585858585",
    configureMemoryCapability: "0x9595959595959595959595959595959595959595959595959595959595959595",
    memoryCommitExecute: "0xa5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5",
    memoryStoreCommitExecute: "0xb5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5",
    reputationAdjustExecute: "0xc5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5",
    deployPayoutRuleAdapter: "0xd5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5",
    configurePayoutCapability: "0xe5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5",
    configurePayoutRule: "0xf5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5",
    payoutExecute: "0x1515151515151515151515151515151515151515151515151515151515151515",
    agentDelegateExecute: "0x2525252525252525252525252525252525252525252525252525252525252525",
    deployAgentDirectory: "0x3535353535353535353535353535353535353535353535353535353535353535",
    registerAgentProfile: "0x4545454545454545454545454545454545454545454545454545454545454545",
    agentProfileMemoryCommitExecute: "0x4646464646464646464646464646464646464646464646464646464646464646",
    registerAgentProfileMemory: "0x4747474747474747474747474747474747474747474747474747474747474747",
    agentProfileIpfsMemoryCommitExecute: "0x4848484848484848484848484848484848484848484848484848484848484848",
    registerAgentProfileIpfsMemory: "0x4949494949494949494949494949494949494949494949494949494949494949",
    deployReputationHistory: "0x5656565656565656565656565656565656565656565656565656565656565656",
    recordReputationEvent: "0x6767676767676767676767676767676767676767676767676767676767676767",
    deployAgentCoordination: "0x7878787878787878787878787878787878787878787878787878787878787878",
    createCoordinationAssignment: "0x8989898989898989898989898989898989898989898989898989898989898989",
    configureCoordinationAcceptanceCapability: "0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
    configureCoordinationCompletionCapability: "0xb1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1",
    acceptCoordinationAssignmentAsAgent: "0xc1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1",
    commitCoordinationResultMemoryAsAgent: "0xd1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1",
    completeCoordinationAssignmentWithMemoryAsAgent: "0xe1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1",
    recordCoordinationOutcomeReputation: "0xf1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1",
    syncReputationScoreFromHistory: "0xa2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2",
    configureCoordinationAssigneePayoutRule: "0x9090909090909090909090909090909090909090909090909090909090909090",
    coordinationAssignmentPayoutExecute: "0x9191919191919191919191919191919191919191919191919191919191919191",
    deployCoordinationPayoutReceiptRegistry: "0x9292929292929292929292929292929292929292929292929292929292929292",
    recordCoordinationPayoutReceipt: "0x9393939393939393939393939393939393939393939393939393939393939393",
  },
  smokeTest: {
    capability: "0x497a7733c30c446bed91d579fce5ede8c3e0fbcdbe90a491d0a07e91d5b88b71",
    targetWasCalled: true,
  },
} as const;

function numberedTransactionHash(index: number): string {
  const byte = (index + 1).toString(16).padStart(2, "0");
  return `0x${byte.repeat(32)}`;
}

function numberedContractAddress(index: number): string {
  return `0x${(index + 1).toString(16).padStart(40, "0")}`;
}

describe("parseDeploymentManifest", () => {
  it("parses a valid Base Sepolia deployment manifest", () => {
    const manifest = parseDeploymentManifest(VALID_MANIFEST);

    expect(manifest.network).toBe("base-sepolia");
    expect(manifest.chainId).toBe(84532);
    expect(manifest.agentProfile).toEqual({
      roleLabel: "agentos.kernel.operator",
      metadataURI: "ipfs://bafkreidohkf2rz54ulzhl7ffl3bb6xqxt67imopitmfgjcbgghorwvzheq",
    });
    expect(manifest.contracts.agentAccount).toBe("0x3248c014d9f235007568A165f2bBE09cAC98d92C");
    expect(requireMockSwapAdapter(manifest)).toBe("0x00000000000000000000000000000000000005a0");
    expect(requireMemoryRegistry(manifest)).toBe("0x0000000000000000000000000000000000000c0f");
    expect(manifest.contracts.payoutRuleAdapter).toBe("0x0000000000000000000000000000000000000aDA");
    expect(manifest.contracts.coordinationPayoutReceiptRegistry).toBe(
      "0x000000000000000000000000000000000000a022",
    );
    expect(requireCoordinationPayoutReceiptRegistry(manifest)).toBe(
      "0x000000000000000000000000000000000000a022",
    );
    expect(manifest.contracts.agentDirectory).toBe("0x0000000000000000000000000000000000000d1a");
    expect(requireReputationHistory(manifest)).toBe("0x0000000000000000000000000000000000000b0b");
    expect(requireAgentCoordination(manifest)).toBe("0x0000000000000000000000000000000000000c00");
    expect(manifest.transactions.reputationAdjustExecute).toBe(
      "0xc5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5",
    );
    expect(manifest.transactions.payoutExecute).toBe(
      "0x1515151515151515151515151515151515151515151515151515151515151515",
    );
    expect(manifest.transactions.agentDelegateExecute).toBe(
      "0x2525252525252525252525252525252525252525252525252525252525252525",
    );
    expect(manifest.transactions.registerAgentProfile).toBe(
      "0x4545454545454545454545454545454545454545454545454545454545454545",
    );
    expect(manifest.transactions.agentProfileMemoryCommitExecute).toBe(
      "0x4646464646464646464646464646464646464646464646464646464646464646",
    );
    expect(manifest.transactions.registerAgentProfileMemory).toBe(
      "0x4747474747474747474747474747474747474747474747474747474747474747",
    );
    expect(manifest.transactions.agentProfileIpfsMemoryCommitExecute).toBe(
      "0x4848484848484848484848484848484848484848484848484848484848484848",
    );
    expect(manifest.transactions.registerAgentProfileIpfsMemory).toBe(
      "0x4949494949494949494949494949494949494949494949494949494949494949",
    );
    expect(manifest.transactions.recordReputationEvent).toBe(
      "0x6767676767676767676767676767676767676767676767676767676767676767",
    );
    expect(manifest.transactions.createCoordinationAssignment).toBe(
      "0x8989898989898989898989898989898989898989898989898989898989898989",
    );
    expect(manifest.transactions.configureCoordinationAcceptanceCapability).toBe(
      "0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
    );
    expect(manifest.transactions.configureCoordinationCompletionCapability).toBe(
      "0xb1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1",
    );
    expect(manifest.transactions.acceptCoordinationAssignmentAsAgent).toBe(
      "0xc1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1",
    );
    expect(manifest.transactions.commitCoordinationResultMemoryAsAgent).toBe(
      "0xd1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1",
    );
    expect(manifest.transactions.completeCoordinationAssignmentWithMemoryAsAgent).toBe(
      "0xe1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1",
    );
    expect(manifest.transactions.recordCoordinationOutcomeReputation).toBe(
      "0xf1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1",
    );
    expect(manifest.transactions.syncReputationScoreFromHistory).toBe(
      "0xa2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2",
    );
    expect(manifest.transactions.configureCoordinationAssigneePayoutRule).toBe(
      "0x9090909090909090909090909090909090909090909090909090909090909090",
    );
    expect(manifest.transactions.coordinationAssignmentPayoutExecute).toBe(
      "0x9191919191919191919191919191919191919191919191919191919191919191",
    );
    expect(manifest.transactions.deployCoordinationPayoutReceiptRegistry).toBe(
      "0x9292929292929292929292929292929292929292929292929292929292929292",
    );
    expect(manifest.transactions.recordCoordinationPayoutReceipt).toBe(
      "0x9393939393939393939393939393939393939393939393939393939393939393",
    );
    expect(manifest.smokeTest.targetWasCalled).toBe(true);
  });

  it("declares the canonical Base manifest envelope field schema", () => {
    expect(DEPLOYMENT_MANIFEST_FIELDS).toEqual([
      ...DEPLOYMENT_MANIFEST_REQUIRED_FIELDS,
      ...DEPLOYMENT_MANIFEST_OPTIONAL_FIELDS,
    ]);
    expect(new Set(DEPLOYMENT_MANIFEST_FIELDS).size).toBe(DEPLOYMENT_MANIFEST_FIELDS.length);
    expect(DEPLOYMENT_MANIFEST_REQUIRED_FIELDS).toEqual([
      "network",
      "chainId",
      "rpcUrlEnv",
      "explorerUrl",
      "owner",
      "contracts",
      "transactions",
      "smokeTest",
    ]);
    expect(DEPLOYMENT_MANIFEST_OPTIONAL_FIELDS).toEqual(["deployedAt", "agentProfile"]);
  });

  it("parses every declared manifest envelope field when present", () => {
    const rawManifest = {
      ...VALID_MANIFEST,
      deployedAt: "2026-06-30T00:00:00.000Z",
    };
    const manifest = parseDeploymentManifest(rawManifest);
    const parsedManifest = manifest as unknown as Record<string, unknown>;

    for (const field of DEPLOYMENT_MANIFEST_FIELDS) {
      expect(parsedManifest[field]).toBeDefined();
    }
  });

  it("declares the canonical Base nested metadata field schemas", () => {
    expect(DEPLOYMENT_AGENT_PROFILE_FIELDS).toEqual(["roleLabel", "metadataURI"]);
    expect(new Set(DEPLOYMENT_AGENT_PROFILE_FIELDS).size).toBe(
      DEPLOYMENT_AGENT_PROFILE_FIELDS.length,
    );
    expect(DEPLOYMENT_MANIFEST_SMOKE_TEST_FIELDS).toEqual(["capability", "targetWasCalled"]);
    expect(new Set(DEPLOYMENT_MANIFEST_SMOKE_TEST_FIELDS).size).toBe(
      DEPLOYMENT_MANIFEST_SMOKE_TEST_FIELDS.length,
    );
  });

  it("declares the canonical Base contract field schema", () => {
    expect(DEPLOYMENT_MANIFEST_CONTRACT_FIELDS).toEqual([
      ...DEPLOYMENT_MANIFEST_REQUIRED_CONTRACT_FIELDS,
      ...DEPLOYMENT_MANIFEST_OPTIONAL_CONTRACT_FIELDS,
    ]);
    expect(new Set(DEPLOYMENT_MANIFEST_CONTRACT_FIELDS).size).toBe(
      DEPLOYMENT_MANIFEST_CONTRACT_FIELDS.length,
    );
    expect(DEPLOYMENT_MANIFEST_REQUIRED_CONTRACT_FIELDS).toEqual([
      "capabilityRegistry",
      "policyEngine",
      "reputationRegistry",
      "agentAccount",
      "testTargetProtocol",
    ]);
    expect(DEPLOYMENT_MANIFEST_OPTIONAL_CONTRACT_FIELDS).toContain("agentCoordination");
  });

  it("parses every declared contract field when present", () => {
    const contracts = Object.fromEntries(
      DEPLOYMENT_MANIFEST_CONTRACT_FIELDS.map((field, index) => [
        field,
        numberedContractAddress(index),
      ]),
    );
    const manifest = parseDeploymentManifest({
      ...VALID_MANIFEST,
      contracts,
    });
    const parsedContracts = manifest.contracts as Record<string, string | undefined>;

    for (const field of DEPLOYMENT_MANIFEST_CONTRACT_FIELDS) {
      expect(parsedContracts[field]).toBe(contracts[field]);
    }
  });

  it("declares the canonical Base transaction field schema", () => {
    expect(DEPLOYMENT_MANIFEST_TRANSACTION_FIELDS).toEqual([
      ...DEPLOYMENT_MANIFEST_REQUIRED_TRANSACTION_FIELDS,
      ...DEPLOYMENT_MANIFEST_OPTIONAL_TRANSACTION_FIELDS,
    ]);
    expect(new Set(DEPLOYMENT_MANIFEST_TRANSACTION_FIELDS).size).toBe(
      DEPLOYMENT_MANIFEST_TRANSACTION_FIELDS.length,
    );
    expect(DEPLOYMENT_MANIFEST_REQUIRED_TRANSACTION_FIELDS).toEqual([
      "deployCapabilityRegistry",
      "deployPolicyEngine",
      "deployReputationRegistry",
      "deployAgentAccount",
      "deployTestTargetProtocol",
      "setCapability",
      "setPolicy",
      "smokeExecute",
    ]);
    expect(DEPLOYMENT_MANIFEST_OPTIONAL_TRANSACTION_FIELDS).toContain(
      "syncReputationScoreFromHistory",
    );
  });

  it("parses every declared transaction field when present", () => {
    const transactions = Object.fromEntries(
      DEPLOYMENT_MANIFEST_TRANSACTION_FIELDS.map((field, index) => [
        field,
        numberedTransactionHash(index),
      ]),
    );
    const manifest = parseDeploymentManifest({
      ...VALID_MANIFEST,
      transactions,
    });
    const parsedTransactions = manifest.transactions as Record<string, string | undefined>;

    for (const field of DEPLOYMENT_MANIFEST_TRANSACTION_FIELDS) {
      expect(parsedTransactions[field]).toBe(transactions[field]);
    }
  });

  it("rejects manifests missing required contract addresses", () => {
    const invalidManifest = {
      ...VALID_MANIFEST,
      contracts: {
        ...VALID_MANIFEST.contracts,
        agentAccount: undefined,
      },
    };

    expect(() => parseDeploymentManifest(invalidManifest)).toThrow("contracts.agentAccount");
  });

  it("resolves agent profile from explicit env, then manifest, then legacy defaults", () => {
    const manifest = parseDeploymentManifest(VALID_MANIFEST);

    expect(resolveDeploymentAgentProfile(manifest, {})).toEqual({
      roleLabel: "agentos.kernel.operator",
      metadataURI: "ipfs://bafkreidohkf2rz54ulzhl7ffl3bb6xqxt67imopitmfgjcbgghorwvzheq",
    });
    expect(
      resolveDeploymentAgentProfile(manifest, {
        AGENT_ROLE_LABEL: "agentos.kernel.researcher",
        AGENT_METADATA_URI: "ipfs://override",
      }),
    ).toEqual({
      roleLabel: "agentos.kernel.researcher",
      metadataURI: "ipfs://override",
    });
    expect(
      resolveDeploymentAgentProfile(
        parseDeploymentManifest({
          ...VALID_MANIFEST,
          agentProfile: undefined,
        }),
        {},
      ),
    ).toEqual({
      roleLabel: "agentos.kernel.operator",
      metadataURI: "agentos://base-sepolia/agent-account/v1",
    });
  });
});
