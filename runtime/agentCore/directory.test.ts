import { decodeFunctionData, keccak256, stringToHex } from "viem";
import { describe, expect, it } from "vitest";

import {
  AGENT_DIRECTORY_ABI,
  createAgentProfileCommitment,
  createRegisterAgentProfileTransaction,
  createSetAgentActiveTransaction,
} from "./directory.js";

describe("createAgentProfileCommitment", () => {
  it("hashes role labels and metadata URIs deterministically", () => {
    const commitment = createAgentProfileCommitment({
      roleLabel: "agentos.kernel.operator",
      metadataURI: "agentos://base-sepolia/agent-account/v1",
    });

    expect(commitment.roleHash).toBe(keccak256(stringToHex("agentos.kernel.operator")));
    expect(commitment.metadataURIHash).toBe(keccak256(stringToHex("agentos://base-sepolia/agent-account/v1")));
  });
});

describe("agent directory transactions", () => {
  it("builds a registerAgent transaction", () => {
    const commitment = createAgentProfileCommitment({
      roleLabel: "agentos.kernel.operator",
      metadataURI: "agentos://base-sepolia/agent-account/v1",
    });
    const transaction = createRegisterAgentProfileTransaction({
      directory: "0x0000000000000000000000000000000000000d1a",
      agent: "0x0000000000000000000000000000000000000a11",
      ...commitment,
      active: true,
    });

    const decoded = decodeFunctionData({
      abi: AGENT_DIRECTORY_ABI,
      data: transaction.data,
    });

    expect(transaction.to).toBe("0x0000000000000000000000000000000000000d1a");
    expect(transaction.value).toBe(0n);
    expect(decoded.functionName).toBe("registerAgent");
    expect(decoded.args[0]).toBe("0x0000000000000000000000000000000000000a11");
    expect(decoded.args[1]).toBe(commitment.roleHash);
    expect(decoded.args[2]).toBe(commitment.metadataURIHash);
    expect(decoded.args[3]).toBe(true);
  });

  it("builds a setActive transaction", () => {
    const transaction = createSetAgentActiveTransaction({
      directory: "0x0000000000000000000000000000000000000d1a",
      agent: "0x0000000000000000000000000000000000000a11",
      active: false,
    });

    const decoded = decodeFunctionData({
      abi: AGENT_DIRECTORY_ABI,
      data: transaction.data,
    });

    expect(transaction.to).toBe("0x0000000000000000000000000000000000000d1a");
    expect(transaction.value).toBe(0n);
    expect(decoded.functionName).toBe("setActive");
    expect(decoded.args[0]).toBe("0x0000000000000000000000000000000000000a11");
    expect(decoded.args[1]).toBe(false);
  });
});
