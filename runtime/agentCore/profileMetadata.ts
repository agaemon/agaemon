import type { Address } from "viem";

export const AGENT_PROFILE_METADATA_SCHEMA = "agentos.agent-profile.v1";

export interface AgentProfileMetadataContracts {
  agentAccount: Address;
  agentDirectory: Address;
  memoryRegistry: Address;
  reputationRegistry: Address;
  reputationHistory?: Address | undefined;
  agentCoordination?: Address | undefined;
}

export interface CreateAgentProfileMetadataDocumentParams {
  network: string;
  chainId: number;
  agent: Address;
  roleLabel: string;
  name: string;
  description: string;
  contracts: AgentProfileMetadataContracts;
}

export function createAgentProfileMemoryIdLabel(agent: Address): string {
  return `agentos.agent-profile.${agent.toLowerCase()}.metadata`;
}

export function createAgentProfileMetadataDocument(params: CreateAgentProfileMetadataDocumentParams): string {
  return `${JSON.stringify(
    {
      schema: AGENT_PROFILE_METADATA_SCHEMA,
      network: params.network,
      chainId: params.chainId,
      agent: params.agent,
      roleLabel: params.roleLabel,
      name: params.name,
      description: params.description,
      contracts: {
        agentAccount: params.contracts.agentAccount,
        agentDirectory: params.contracts.agentDirectory,
        memoryRegistry: params.contracts.memoryRegistry,
        reputationRegistry: params.contracts.reputationRegistry,
        reputationHistory: params.contracts.reputationHistory ?? null,
        agentCoordination: params.contracts.agentCoordination ?? null,
      },
    },
    null,
    2,
  )}\n`;
}
