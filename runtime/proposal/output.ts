import type { AgentAction } from "../core/action.js";
import type { AgentPlanProposal } from "../agentPlanning/planProposal.js";
import type { PolicyDecision } from "../core/policy.js";
import type { ExecuteTransaction } from "../transactions/builder.js";

export type AgentProposalSource =
  | {
      type: "plan";
      path: string;
    }
  | {
      type: "intent";
      path: string;
    };

export interface CreateAgentProposalOutputParams {
  chainId: number;
  manifestPath: string;
  source: AgentProposalSource;
  proposal: AgentPlanProposal;
}

export interface CreateAgentProposalWriteSummaryParams extends CreateAgentProposalOutputParams {
  outputPath: string;
}

export type JsonAgentProposalOutput = {
  mode: "dry-run";
  chainId: number;
  manifest: string;
  objective: string;
  agent: string;
  executable: boolean;
  steps: JsonAgentProposalStep[];
} & JsonAgentProposalSource;

export interface JsonAgentProposalStep {
  id: string;
  title: string;
  action: JsonAgentProposalAction;
  decision: PolicyDecision;
  transaction: JsonAgentProposalTransaction | null;
}

export interface JsonAgentProposalAction {
  capability: string;
  target: string;
  valueWei: string;
  data: string;
  usesBorrowing: boolean;
}

export interface JsonAgentProposalTransaction {
  to: string;
  value: string;
  data: string;
}

export type JsonAgentProposalWriteSummary = {
  mode: "dry-run";
  chainId: number;
  manifest: string;
  output: string;
  executable: boolean;
  steps: number;
  written: true;
} & JsonAgentProposalSource;

type JsonAgentProposalSource =
  | {
      plan: string;
      intent?: never;
    }
  | {
      intent: string;
      plan?: never;
    };

export function createAgentProposalOutput(params: CreateAgentProposalOutputParams): JsonAgentProposalOutput {
  return {
    mode: "dry-run",
    chainId: params.chainId,
    manifest: params.manifestPath,
    ...formatSource(params.source),
    objective: params.proposal.objective,
    agent: params.proposal.agent,
    executable: params.proposal.executable,
    steps: params.proposal.steps.map((step) => ({
      id: step.id,
      title: step.title,
      action: formatAction(step.action),
      decision: step.decision,
      transaction: formatTransaction(step.transaction),
    })),
  };
}

export function createAgentProposalWriteSummary(
  params: CreateAgentProposalWriteSummaryParams,
): JsonAgentProposalWriteSummary {
  return {
    mode: "dry-run",
    chainId: params.chainId,
    manifest: params.manifestPath,
    ...formatSource(params.source),
    output: params.outputPath,
    executable: params.proposal.executable,
    steps: params.proposal.steps.length,
    written: true,
  };
}

function formatSource(source: AgentProposalSource): JsonAgentProposalSource {
  if (source.type === "plan") return { plan: source.path };
  return { intent: source.path };
}

function formatAction(action: AgentAction): JsonAgentProposalAction {
  return {
    capability: action.capability,
    target: action.target,
    valueWei: action.value.toString(),
    data: action.data,
    usesBorrowing: action.usesBorrowing,
  };
}

function formatTransaction(transaction: ExecuteTransaction | null): JsonAgentProposalTransaction | null {
  if (transaction === null) return null;
  return {
    to: transaction.to,
    value: transaction.value.toString(),
    data: transaction.data,
  };
}
