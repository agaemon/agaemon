import { describe, expect, it } from "vitest";

import {
  createAgentProfileMemoryIdLabel,
  createAgentProfileMetadataDocument,
} from "./profileMetadata.js";

describe("createAgentProfileMemoryIdLabel", () => {
  it("derives a stable per-agent profile memory label", () => {
    expect(createAgentProfileMemoryIdLabel("0x0000000000000000000000000000000000000A11")).toBe(
      "agentos.agent-profile.0x0000000000000000000000000000000000000a11.metadata",
    );
  });
});

describe("createAgentProfileMetadataDocument", () => {
  it("creates deterministic profile metadata JSON", () => {
    const document = createAgentProfileMetadataDocument({
      network: "base-sepolia",
      chainId: 84532,
      agent: "0x0000000000000000000000000000000000000A11",
      roleLabel: "agentos.kernel.operator",
      name: "AgentOS Kernel Operator",
      description: "Base Sepolia AgentOS kernel operator profile",
      contracts: {
        agentAccount: "0x0000000000000000000000000000000000000A11",
        agentDirectory: "0x0000000000000000000000000000000000000D1A",
        memoryRegistry: "0x0000000000000000000000000000000000000C0F",
        reputationRegistry: "0x0000000000000000000000000000000000000B0B",
        reputationHistory: "0x0000000000000000000000000000000000000F00",
        agentCoordination: "0x0000000000000000000000000000000000000C00",
      },
    });

    expect(document).toBe(`{
  "schema": "agentos.agent-profile.v1",
  "network": "base-sepolia",
  "chainId": 84532,
  "agent": "0x0000000000000000000000000000000000000A11",
  "roleLabel": "agentos.kernel.operator",
  "name": "AgentOS Kernel Operator",
  "description": "Base Sepolia AgentOS kernel operator profile",
  "contracts": {
    "agentAccount": "0x0000000000000000000000000000000000000A11",
    "agentDirectory": "0x0000000000000000000000000000000000000D1A",
    "memoryRegistry": "0x0000000000000000000000000000000000000C0F",
    "reputationRegistry": "0x0000000000000000000000000000000000000B0B",
    "reputationHistory": "0x0000000000000000000000000000000000000F00",
    "agentCoordination": "0x0000000000000000000000000000000000000C00"
  }
}
`);
  });

  it("uses null for optional contracts that are not deployed", () => {
    const metadata = JSON.parse(
      createAgentProfileMetadataDocument({
        network: "base-sepolia",
        chainId: 84532,
        agent: "0x0000000000000000000000000000000000000A11",
        roleLabel: "agentos.kernel.operator",
        name: "AgentOS Kernel Operator",
        description: "Base Sepolia AgentOS kernel operator profile",
        contracts: {
          agentAccount: "0x0000000000000000000000000000000000000A11",
          agentDirectory: "0x0000000000000000000000000000000000000D1A",
          memoryRegistry: "0x0000000000000000000000000000000000000C0F",
          reputationRegistry: "0x0000000000000000000000000000000000000B0B",
        },
      }),
    ) as { contracts: { reputationHistory: null; agentCoordination: null } };

    expect(metadata.contracts.reputationHistory).toBeNull();
    expect(metadata.contracts.agentCoordination).toBeNull();
  });
});
