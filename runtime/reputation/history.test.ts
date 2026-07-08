import { decodeFunctionData, encodeAbiParameters, keccak256, stringToHex } from "viem";
import { describe, expect, it } from "vitest";

import {
  createCoordinationOutcomeEvidenceHash,
  createCoordinationOutcomeReputationTransaction,
  createRecordReputationEventTransaction,
  createReputationEventCommitment,
  REPUTATION_HISTORY_ABI,
} from "./history.js";

describe("createReputationEventCommitment", () => {
  it("hashes action labels and evidence URIs deterministically", () => {
    const commitment = createReputationEventCommitment({
      actionLabel: "agentos.kernel.directory-profile-registered",
      evidenceURI: "agentos://base-sepolia/reputation-history/directory-profile/v1",
    });

    expect(commitment.actionHash).toBe(keccak256(stringToHex("agentos.kernel.directory-profile-registered")));
    expect(commitment.evidenceHash).toBe(
      keccak256(stringToHex("agentos://base-sepolia/reputation-history/directory-profile/v1")),
    );
  });
});

describe("createCoordinationOutcomeEvidenceHash", () => {
  it("hashes completed assignment outcome fields deterministically", () => {
    const params = {
      coordination: "0x0000000000000000000000000000000000000c00" as const,
      assignmentId: 7n,
      assignee: "0x0000000000000000000000000000000000000a11" as const,
      resultHash: "0x1111111111111111111111111111111111111111111111111111111111111111" as const,
      resultMemoryId: "0x2222222222222222222222222222222222222222222222222222222222222222" as const,
      resultMerkleRoot: "0x3333333333333333333333333333333333333333333333333333333333333333" as const,
    };

    expect(createCoordinationOutcomeEvidenceHash(params)).toBe(
      keccak256(
        encodeAbiParameters(
          [
            { name: "coordination", type: "address" },
            { name: "assignmentId", type: "uint256" },
            { name: "assignee", type: "address" },
            { name: "resultHash", type: "bytes32" },
            { name: "resultMemoryId", type: "bytes32" },
            { name: "resultMerkleRoot", type: "bytes32" },
          ],
          [
            params.coordination,
            params.assignmentId,
            params.assignee,
            params.resultHash,
            params.resultMemoryId,
            params.resultMerkleRoot,
          ],
        ),
      ),
    );
  });
});

describe("createCoordinationOutcomeReputationTransaction", () => {
  it("builds a reputation event transaction for a coordination outcome", () => {
    const transaction = createCoordinationOutcomeReputationTransaction({
      history: "0x0000000000000000000000000000000000000b0b",
      actionLabel: "agentos.coordination.assignment.completed",
      scoreDelta: 2n,
      coordination: "0x0000000000000000000000000000000000000c00",
      assignmentId: 7n,
      assignee: "0x0000000000000000000000000000000000000a11",
      resultHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
      resultMemoryId: "0x2222222222222222222222222222222222222222222222222222222222222222",
      resultMerkleRoot: "0x3333333333333333333333333333333333333333333333333333333333333333",
    });

    const decoded = decodeFunctionData({
      abi: REPUTATION_HISTORY_ABI,
      data: transaction.data,
    });

    expect(transaction.to).toBe("0x0000000000000000000000000000000000000b0b");
    expect(transaction.value).toBe(0n);
    expect(decoded.functionName).toBe("recordEvent");
    expect(decoded.args[0]).toBe("0x0000000000000000000000000000000000000a11");
    expect(decoded.args[1]).toBe(keccak256(stringToHex("agentos.coordination.assignment.completed")));
    expect(decoded.args[2]).toBe(
      createCoordinationOutcomeEvidenceHash({
        coordination: "0x0000000000000000000000000000000000000c00",
        assignmentId: 7n,
        assignee: "0x0000000000000000000000000000000000000a11",
        resultHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
        resultMemoryId: "0x2222222222222222222222222222222222222222222222222222222222222222",
        resultMerkleRoot: "0x3333333333333333333333333333333333333333333333333333333333333333",
      }),
    );
    expect(decoded.args[3]).toBe(2n);
  });
});

describe("createRecordReputationEventTransaction", () => {
  it("builds a recordEvent transaction", () => {
    const commitment = createReputationEventCommitment({
      actionLabel: "agentos.kernel.directory-profile-registered",
      evidenceURI: "agentos://base-sepolia/reputation-history/directory-profile/v1",
    });
    const transaction = createRecordReputationEventTransaction({
      history: "0x0000000000000000000000000000000000000b0b",
      agent: "0x0000000000000000000000000000000000000a11",
      ...commitment,
      scoreDelta: 1n,
    });

    const decoded = decodeFunctionData({
      abi: REPUTATION_HISTORY_ABI,
      data: transaction.data,
    });

    expect(transaction.to).toBe("0x0000000000000000000000000000000000000b0b");
    expect(transaction.value).toBe(0n);
    expect(decoded.functionName).toBe("recordEvent");
    expect(decoded.args[0]).toBe("0x0000000000000000000000000000000000000a11");
    expect(decoded.args[1]).toBe(commitment.actionHash);
    expect(decoded.args[2]).toBe(commitment.evidenceHash);
    expect(decoded.args[3]).toBe(1n);
  });

  it("supports negative score deltas", () => {
    const transaction = createRecordReputationEventTransaction({
      history: "0x0000000000000000000000000000000000000b0b",
      agent: "0x0000000000000000000000000000000000000a11",
      actionHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
      evidenceHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
      scoreDelta: -1n,
    });

    const decoded = decodeFunctionData({
      abi: REPUTATION_HISTORY_ABI,
      data: transaction.data,
    });

    expect(decoded.args[3]).toBe(-1n);
  });
});
