import { createAgentPlanProposal } from "../agentPlanning/planProposal.js";
import { createAgentProposalOutput } from "../proposal/output.js";
import { createAgentOsLocalWorkflowPackage } from "./localWorkflow.js";

import type {
  AgentPlanProposal,
  AgentPlanProposalDocument,
  CreateAgentPlanProposalParams,
} from "../agentPlanning/planProposal.js";
import type {
  JsonAgentProposalOutput,
} from "../proposal/output.js";
import type {
  AgentProposalReviewDecision,
} from "../proposalReview/approval.js";
import type {
  AgentOsLocalWorkflowPackage,
} from "./localWorkflow.js";

export interface CreateAgentOsPlanWorkflowPackageParams extends AgentPlanProposalDocument {
  agent: CreateAgentPlanProposalParams["agent"];
  simulatePolicy: CreateAgentPlanProposalParams["simulatePolicy"];
  chainId: number;
  deploymentManifestPath: string;
  planPath: string;
  proposalPath: string;
  summaryPath: string;
  summaryMarkdown?: string | undefined;
  reviewManifestPath: string;
  approvalPath: string;
  bundlePath: string;
  previewPath: string;
  runbookPath: string;
  executionManifestPath: string;
  reviewer: string;
  decision: AgentProposalReviewDecision;
  generatedAt?: string | undefined;
}

export interface AgentOsPlanWorkflowProposalArtifact {
  path: string;
  json: string;
  output: JsonAgentProposalOutput;
}

export interface AgentOsPlanWorkflowPackage {
  passed: boolean;
  failures: string[];
  proposal: AgentPlanProposal;
  proposalArtifact: AgentOsPlanWorkflowProposalArtifact;
  workflow: AgentOsLocalWorkflowPackage;
}

export async function createAgentOsPlanWorkflowPackage(
  params: CreateAgentOsPlanWorkflowPackageParams,
): Promise<AgentOsPlanWorkflowPackage> {
  const proposal = await createAgentPlanProposal(params);
  const output = createAgentProposalOutput({
    chainId: params.chainId,
    manifestPath: params.deploymentManifestPath,
    source: {
      type: "plan",
      path: params.planPath,
    },
    proposal,
  });
  const proposalJson = `${JSON.stringify(output, null, 2)}\n`;
  const workflow = createAgentOsLocalWorkflowPackage({
    proposalPath: params.proposalPath,
    proposalJson,
    summaryPath: params.summaryPath,
    summaryMarkdown: params.summaryMarkdown,
    manifestPath: params.reviewManifestPath,
    approvalPath: params.approvalPath,
    bundlePath: params.bundlePath,
    previewPath: params.previewPath,
    runbookPath: params.runbookPath,
    executionManifestPath: params.executionManifestPath,
    reviewer: params.reviewer,
    decision: params.decision,
    generatedAt: params.generatedAt,
  });

  return {
    passed: workflow.passed,
    failures: workflow.failures,
    proposal,
    proposalArtifact: {
      path: params.proposalPath,
      json: proposalJson,
      output,
    },
    workflow,
  };
}
