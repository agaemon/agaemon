import { createAgentIntentPlan } from "./intentCompiler.js";
import type { AgentIntentDocument } from "./intentCompiler.js";
import { createAgentPlanProposal } from "./planProposal.js";
import type { AgentPlanProposal } from "./planProposal.js";
import type { DeploymentManifest } from "../base/deploymentManifest.js";
import type { SimulatePolicy } from "../core/policy.js";

export interface CreateAgentIntentProposalParams extends AgentIntentDocument {
  manifest: DeploymentManifest;
  simulatePolicy: SimulatePolicy;
}

export async function createAgentIntentProposal(
  params: CreateAgentIntentProposalParams,
): Promise<AgentPlanProposal> {
  const plan = createAgentIntentPlan({
    manifest: params.manifest,
    objective: params.objective,
    intents: params.intents,
  });

  return createAgentPlanProposal({
    agent: params.manifest.contracts.agentAccount,
    objective: plan.objective,
    steps: plan.steps,
    simulatePolicy: params.simulatePolicy,
  });
}
