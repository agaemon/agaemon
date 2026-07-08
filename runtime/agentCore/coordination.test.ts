import { decodeFunctionData, encodeAbiParameters, getAddress, keccak256, stringToHex } from "viem";
import type { Address, Hex } from "viem";
import { describe, expect, it } from "vitest";

import {
  AGENT_COORDINATION_ABI,
  COORDINATION_ACCEPT_CAPABILITY,
  COORDINATION_COMPLETE_CAPABILITY,
  createCoordinationAcceptanceAction,
  createCoordinationCompletionAction,
  createCoordinationMemoryCompletionAction,
  createCoordinationMemoryResultHash,
  createAgentCoordinationCommitment,
  createCoordinationEvidenceHash,
  createAcceptCoordinationAssignmentTransaction,
  createCancelCoordinationAssignmentTransaction,
  createCoordinationAssignmentTransaction,
  createCompleteCoordinationAssignmentTransaction,
} from "./coordination.js";

describe("createAgentCoordinationCommitment", () => {
  it("hashes task labels and context URIs deterministically", () => {
    const commitment = createAgentCoordinationCommitment({
      taskLabel: "agentos.kernel.directory-profile-audit",
      contextURI: "agentos://base-sepolia/coordination/directory-profile-audit/v1",
    });

    expect(commitment.taskHash).toBe(keccak256(stringToHex("agentos.kernel.directory-profile-audit")));
    expect(commitment.contextHash).toBe(
      keccak256(stringToHex("agentos://base-sepolia/coordination/directory-profile-audit/v1")),
    );
  });
});

describe("createCoordinationCompletionAction", () => {
  it("builds a zero-value agent action for assignee completion", () => {
    const resultHash = createCoordinationEvidenceHash(
      "agentos://base-sepolia/coordination/directory-profile-audit/result/v1",
    );
    const action = createCoordinationCompletionAction({
      coordination: "0x0000000000000000000000000000000000000c00",
      assignmentId: 3n,
      resultHash,
    });

    const decoded = decodeFunctionData({
      abi: AGENT_COORDINATION_ABI,
      data: action.data,
    });

    expect(COORDINATION_COMPLETE_CAPABILITY).toBe(
      "0x00e928b7a6b30b817fda9abae2db0783dbe2bc8ac963dcd48d915ed2cebc2570",
    );
    expect(action.capability).toBe(COORDINATION_COMPLETE_CAPABILITY);
    expect(action.target).toBe("0x0000000000000000000000000000000000000c00");
    expect(action.value).toBe(0n);
    expect(action.usesBorrowing).toBe(false);
    expect(decoded.functionName).toBe("completeAssignmentByAssignee");
    expect(decoded.args).toStrictEqual([3n, resultHash]);
  });
});

describe("createCoordinationMemoryCompletionAction", () => {
  it("builds a zero-value agent action for memory-backed assignee completion", () => {
    const memoryId = keccak256(stringToHex("agentos.coordination.directory-profile-audit.result"));
    const merkleRoot = keccak256(stringToHex("AgentOS coordination result memory"));
    const action = createCoordinationMemoryCompletionAction({
      coordination: "0x0000000000000000000000000000000000000c00",
      assignmentId: 3n,
      memoryId,
      merkleRoot,
    });

    const decoded = decodeFunctionData({
      abi: AGENT_COORDINATION_ABI,
      data: action.data,
    });

    expect(action.capability).toBe(COORDINATION_COMPLETE_CAPABILITY);
    expect(action.target).toBe("0x0000000000000000000000000000000000000c00");
    expect(action.value).toBe(0n);
    expect(action.usesBorrowing).toBe(false);
    expect(decoded.functionName).toBe("completeAssignmentByAssigneeWithMemory");
    expect(decoded.args).toStrictEqual([3n, memoryId, merkleRoot]);
  });
});

describe("createCoordinationMemoryResultHash", () => {
  it("hashes memory id and merkle root like the contract", () => {
    const memoryId = keccak256(stringToHex("agentos.coordination.directory-profile-audit.result"));
    const merkleRoot = keccak256(stringToHex("AgentOS coordination result memory"));

    expect(createCoordinationMemoryResultHash({ memoryId, merkleRoot })).toBe(
      keccak256(
        encodeAbiParameters(
          [
            { name: "memoryId", type: "bytes32" },
            { name: "merkleRoot", type: "bytes32" },
          ],
          [memoryId, merkleRoot],
        ),
      ),
    );
  });
});

describe("createCoordinationEvidenceHash", () => {
  it("hashes evidence URIs deterministically", () => {
    const evidenceURI = "agentos://base-sepolia/coordination/directory-profile-audit/result/v1";

    expect(createCoordinationEvidenceHash(evidenceURI)).toBe(keccak256(stringToHex(evidenceURI)));
  });
});

describe("createCoordinationAssignmentTransaction", () => {
  it("builds a createAssignment transaction", () => {
    const commitment = createAgentCoordinationCommitment({
      taskLabel: "agentos.kernel.directory-profile-audit",
      contextURI: "agentos://base-sepolia/coordination/directory-profile-audit/v1",
    });
    const transaction = createCoordinationAssignmentTransaction({
      coordination: "0x0000000000000000000000000000000000000c00",
      assigner: "0x0000000000000000000000000000000000000a11",
      assignee: "0x0000000000000000000000000000000000000b0b",
      ...commitment,
    });

    const decoded = decodeFunctionData({
      abi: AGENT_COORDINATION_ABI,
      data: transaction.data,
    });

    expect(transaction.to).toBe("0x0000000000000000000000000000000000000c00");
    expect(transaction.value).toBe(0n);
    expect(decoded.functionName).toBe("createAssignment");
    const args = decoded.args as readonly [Address, Address, Hex, Hex];
    expect(getAddress(args[0])).toBe(getAddress("0x0000000000000000000000000000000000000a11"));
    expect(getAddress(args[1])).toBe(getAddress("0x0000000000000000000000000000000000000b0b"));
    expect(args[2]).toBe(commitment.taskHash);
    expect(args[3]).toBe(commitment.contextHash);
  });
});

describe("coordination lifecycle transactions", () => {
  it("builds an acceptAssignment transaction", () => {
    const transaction = createAcceptCoordinationAssignmentTransaction({
      coordination: "0x0000000000000000000000000000000000000c00",
      assignmentId: 3n,
    });

    const decoded = decodeFunctionData({
      abi: AGENT_COORDINATION_ABI,
      data: transaction.data,
    });

    expect(transaction.to).toBe("0x0000000000000000000000000000000000000c00");
    expect(transaction.value).toBe(0n);
    expect(decoded.functionName).toBe("acceptAssignment");
    expect(decoded.args).toStrictEqual([3n]);
  });

  it("builds a completeAssignment transaction", () => {
    const evidenceHash = createCoordinationEvidenceHash(
      "agentos://base-sepolia/coordination/directory-profile-audit/result/v1",
    );
    const transaction = createCompleteCoordinationAssignmentTransaction({
      coordination: "0x0000000000000000000000000000000000000c00",
      assignmentId: 3n,
      resultHash: evidenceHash,
    });

    const decoded = decodeFunctionData({
      abi: AGENT_COORDINATION_ABI,
      data: transaction.data,
    });

    expect(transaction.to).toBe("0x0000000000000000000000000000000000000c00");
    expect(transaction.value).toBe(0n);
    expect(decoded.functionName).toBe("completeAssignment");
    expect(decoded.args).toStrictEqual([3n, evidenceHash]);
  });

  it("builds a cancelAssignment transaction", () => {
    const evidenceHash = createCoordinationEvidenceHash(
      "agentos://base-sepolia/coordination/directory-profile-audit/cancelled/v1",
    );
    const transaction = createCancelCoordinationAssignmentTransaction({
      coordination: "0x0000000000000000000000000000000000000c00",
      assignmentId: 3n,
      cancellationHash: evidenceHash,
    });

    const decoded = decodeFunctionData({
      abi: AGENT_COORDINATION_ABI,
      data: transaction.data,
    });

    expect(transaction.to).toBe("0x0000000000000000000000000000000000000c00");
    expect(transaction.value).toBe(0n);
    expect(decoded.functionName).toBe("cancelAssignment");
    expect(decoded.args).toStrictEqual([3n, evidenceHash]);
  });
});

describe("createCoordinationAcceptanceAction", () => {
  it("builds a zero-value agent action for assignee acceptance", () => {
    const action = createCoordinationAcceptanceAction({
      coordination: "0x0000000000000000000000000000000000000c00",
      assignmentId: 3n,
    });

    const decoded = decodeFunctionData({
      abi: AGENT_COORDINATION_ABI,
      data: action.data,
    });

    expect(COORDINATION_ACCEPT_CAPABILITY).toBe(
      "0xfd778ede067bae6cfb1ad4c78ad182f9b874ad21ed3f82d26541f9bfdda17a6d",
    );
    expect(action.capability).toBe(COORDINATION_ACCEPT_CAPABILITY);
    expect(action.target).toBe("0x0000000000000000000000000000000000000c00");
    expect(action.value).toBe(0n);
    expect(action.usesBorrowing).toBe(false);
    expect(decoded.functionName).toBe("acceptAssignmentByAssignee");
    expect(decoded.args).toStrictEqual([3n]);
  });
});
