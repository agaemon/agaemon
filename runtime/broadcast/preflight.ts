import { verifyAgentProposalExecutionSignedPayload } from "../proposalExecution/signedPayloadVerify.js";

import type {
  AgentProposalExecutionSignedPayloadVerification,
  VerifyAgentProposalExecutionSignedPayloadParams,
} from "../proposalExecution/signedPayloadVerify.js";

export interface CreateAgentProposalExecutionBroadcastPreflightParams
  extends VerifyAgentProposalExecutionSignedPayloadParams {
  client: AgentProposalExecutionBroadcastPreflightClient;
}

export interface AgentProposalExecutionBroadcastPreflightClient {
  getChainId(): Promise<number>;
  getTransactionCount(params: { address: string; blockTag: "pending" }): Promise<number>;
}

export interface AgentProposalExecutionBroadcastPreflightCheck {
  name: "signed-payload" | "chain" | "nonce";
  passed: boolean;
  failures: string[];
}

export interface AgentProposalExecutionBroadcastPreflightReport {
  passed: boolean;
  failures: string[];
  signedPayload: string;
  payload: string;
  signer: string | null;
  expectedChainId: number | null;
  connectedChainId: number | null;
  expectedNonce: number | null;
  pendingNonce: number | null;
  transactions: number;
  checks: AgentProposalExecutionBroadcastPreflightCheck[];
}

export async function createAgentProposalExecutionBroadcastPreflight(
  params: CreateAgentProposalExecutionBroadcastPreflightParams,
): Promise<AgentProposalExecutionBroadcastPreflightReport> {
  const signedPayloadVerification = await verifyAgentProposalExecutionSignedPayload(params);
  const signedPayloadCheck: AgentProposalExecutionBroadcastPreflightCheck = {
    name: "signed-payload",
    passed: signedPayloadVerification.passed,
    failures: signedPayloadVerification.failures,
  };
  if (!signedPayloadVerification.passed) {
    return createReport(params, signedPayloadVerification, [signedPayloadCheck], null, null);
  }

  const connectedChainId = await params.client.getChainId();
  const expectedChainId = signedPayloadVerification.preflight.chainId;
  const chainFailures = expectedChainId === connectedChainId
    ? []
    : [`connected chain ${connectedChainId} does not match signed payload chain ${expectedChainId}`];
  const chainCheck: AgentProposalExecutionBroadcastPreflightCheck = {
    name: "chain",
    passed: chainFailures.length === 0,
    failures: chainFailures,
  };
  if (!chainCheck.passed || signedPayloadVerification.preflight.signer === null) {
    return createReport(params, signedPayloadVerification, [signedPayloadCheck, chainCheck], connectedChainId, null);
  }

  const pendingNonce = await params.client.getTransactionCount({
    address: signedPayloadVerification.preflight.signer,
    blockTag: "pending",
  });
  const expectedNonce = signedPayloadVerification.preflight.nonceStart;
  const nonceFailures = expectedNonce === pendingNonce
    ? []
    : [`pending nonce ${pendingNonce} does not match signed payload nonce ${expectedNonce}`];
  const nonceCheck: AgentProposalExecutionBroadcastPreflightCheck = {
    name: "nonce",
    passed: nonceFailures.length === 0,
    failures: nonceFailures,
  };

  return createReport(
    params,
    signedPayloadVerification,
    [signedPayloadCheck, chainCheck, nonceCheck],
    connectedChainId,
    pendingNonce,
  );
}

function createReport(
  params: Pick<CreateAgentProposalExecutionBroadcastPreflightParams, "signedPayloadPath" | "payloadPath">,
  signedPayloadVerification: AgentProposalExecutionSignedPayloadVerification,
  checks: AgentProposalExecutionBroadcastPreflightCheck[],
  connectedChainId: number | null,
  pendingNonce: number | null,
): AgentProposalExecutionBroadcastPreflightReport {
  return {
    passed: checks.every((check) => check.passed),
    failures: uniqueFailures(checks.flatMap((check) => check.failures)),
    signedPayload: params.signedPayloadPath,
    payload: params.payloadPath,
    signer: signedPayloadVerification.preflight.signer,
    expectedChainId: signedPayloadVerification.preflight.chainId,
    connectedChainId,
    expectedNonce: signedPayloadVerification.preflight.nonceStart,
    pendingNonce,
    transactions: signedPayloadVerification.preflight.transactions,
    checks,
  };
}

function uniqueFailures(failures: string[]): string[] {
  return [...new Set(failures)];
}
