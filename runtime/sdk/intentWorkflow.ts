import { createAgentIntentProposal } from "../agentPlanning/intentProposal.js";
import { createAgentProposalOutput } from "../proposal/output.js";
import { createAgentOsLocalWorkflowPackage } from "./localWorkflow.js";

import type {
  AgentIntentDocument,
} from "../agentPlanning/intentCompiler.js";
import type {
  CreateAgentIntentProposalParams,
} from "../agentPlanning/intentProposal.js";
import type {
  AgentPlanProposal,
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

export interface CreateAgentOsIntentWorkflowPackageParams extends AgentIntentDocument {
  manifest: CreateAgentIntentProposalParams["manifest"];
  simulatePolicy: CreateAgentIntentProposalParams["simulatePolicy"];
  deploymentManifestPath: string;
  intentPath: string;
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

export interface AgentOsIntentWorkflowProposalArtifact {
  path: string;
  json: string;
  output: JsonAgentProposalOutput;
}

export interface AgentOsIntentWorkflowPackage {
  passed: boolean;
  failures: string[];
  proposal: AgentPlanProposal;
  proposalArtifact: AgentOsIntentWorkflowProposalArtifact;
  workflow: AgentOsLocalWorkflowPackage;
}

export async function createAgentOsIntentWorkflowPackage(
  params: CreateAgentOsIntentWorkflowPackageParams,
): Promise<AgentOsIntentWorkflowPackage> {
  const proposal = await createAgentIntentProposal(params);
  const output = createAgentProposalOutput({
    chainId: params.manifest.chainId,
    manifestPath: params.deploymentManifestPath,
    source: {
      type: "intent",
      path: params.intentPath,
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
