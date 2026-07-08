import { createHash } from "node:crypto";

import { verifyAgentProposalExecutionSignedPayload } from "../proposalExecution/signedPayloadVerify.js";

import type { AgentProposalExecutionBroadcastPreflightReport } from "./preflight.js";
import type { VerifyAgentProposalExecutionSignedPayloadParams } from "../proposalExecution/signedPayloadVerify.js";

export interface CreateAgentProposalExecutionBroadcastPackageParams
  extends VerifyAgentProposalExecutionSignedPayloadParams {
  broadcastPreflightPath: string;
  broadcastPreflightJson: string;
  generatedAt?: string | undefined;
}

export interface AgentProposalExecutionBroadcastPackageResult {
  passed: boolean;
  failures: string[];
  package: AgentProposalExecutionBroadcastPackage | null;
}

export interface AgentProposalExecutionBroadcastPackage {
  schemaVersion: 1;
  generatedAt: string;
  broadcastPreflight: AgentProposalExecutionBroadcastPackageFile;
  signedPayload: AgentProposalExecutionBroadcastPackageFile;
  signingPayload: AgentProposalExecutionBroadcastPackageFile;
  readiness: AgentProposalExecutionBroadcastPackageFile;
  preview: AgentProposalExecutionBroadcastPackageFile;
  runbook: AgentProposalExecutionBroadcastPackageFile;
  executionManifest: AgentProposalExecutionBroadcastPackageFile;
  bundle: AgentProposalExecutionBroadcastPackageFile;
  approval: AgentProposalExecutionBroadcastPackageFile;
  manifest: AgentProposalExecutionBroadcastPackageFile;
  proposal: AgentProposalExecutionBroadcastPackageFile;
  summary: AgentProposalExecutionBroadcastPackageFile;
  signer: string;
  chainId: number;
  nonceStart: number;
  pendingNonce: number;
  transactions: AgentProposalExecutionBroadcastPackageTransaction[];
}

export interface AgentProposalExecutionBroadcastPackageFile {
  path: string;
  sha256: string;
}

export interface AgentProposalExecutionBroadcastPackageTransaction {
  index: number;
  rawTransaction: string;
}

interface SignedPayloadArtifact {
  transactions: AgentProposalExecutionBroadcastPackageTransaction[];
}

export async function createAgentProposalExecutionBroadcastPackage(
  params: CreateAgentProposalExecutionBroadcastPackageParams,
): Promise<AgentProposalExecutionBroadcastPackageResult> {
  const failures: string[] = [];
  const broadcastPreflight = parseBroadcastPreflight(params.broadcastPreflightJson, failures);
  const signedPayload = parseSignedPayload(params.signedPayloadJson, failures);
  const signedPayloadVerification = await verifyAgentProposalExecutionSignedPayload(params);
  failures.push(...signedPayloadVerification.failures);

  if (broadcastPreflight !== null) validateBroadcastPreflight(params, broadcastPreflight, signedPayloadVerification, failures);

  if (failures.length > 0 || broadcastPreflight === null || signedPayload === null) {
    return {
      passed: false,
      failures: uniqueFailures(failures),
      package: null,
    };
  }

  const signer = broadcastPreflight.signer;
  const chainId = broadcastPreflight.expectedChainId;
  const nonceStart = broadcastPreflight.expectedNonce;
  const pendingNonce = broadcastPreflight.pendingNonce;
  if (signer === null || chainId === null || nonceStart === null || pendingNonce === null) {
    return {
      passed: false,
      failures: ["broadcast preflight must include signer, chain ID, expected nonce, and pending nonce"],
      package: null,
    };
  }

  return {
    passed: true,
    failures: [],
    package: {
      schemaVersion: 1,
      generatedAt: params.generatedAt ?? new Date().toISOString(),
      broadcastPreflight: file(params.broadcastPreflightPath, params.broadcastPreflightJson),
      signedPayload: file(params.signedPayloadPath, params.signedPayloadJson),
      signingPayload: file(params.payloadPath, params.payloadJson),
      readiness: file(params.readinessPath, params.readinessJson),
      preview: file(params.previewPath, params.previewJson),
      runbook: file(params.runbookPath, params.runbookMarkdown),
      executionManifest: file(params.executionManifestPath, params.executionManifestJson),
      bundle: file(params.bundlePath, params.bundleJson),
      approval: file(params.approvalPath, params.approvalJson),
      manifest: file(params.manifestPath, params.manifestJson),
      proposal: file(params.proposalPath, params.proposalJson),
      summary: file(params.summaryPath, params.summaryMarkdown),
      signer,
      chainId,
      nonceStart,
      pendingNonce,
      transactions: signedPayload.transactions.map((transaction) => ({
        index: transaction.index,
        rawTransaction: transaction.rawTransaction,
      })),
    },
  };
}

function validateBroadcastPreflight(
  params: CreateAgentProposalExecutionBroadcastPackageParams,
  broadcastPreflight: AgentProposalExecutionBroadcastPreflightReport,
  signedPayloadVerification: Awaited<ReturnType<typeof verifyAgentProposalExecutionSignedPayload>>,
  failures: string[],
): void {
  if (!broadcastPreflight.passed) failures.push("broadcast preflight must pass before creating a broadcast package");
  if (Array.isArray(broadcastPreflight.failures)) failures.push(...broadcastPreflight.failures);
  if (broadcastPreflight.signedPayload !== params.signedPayloadPath) {
    failures.push("broadcast preflight signedPayload path must match signed payload argument");
  }
  if (broadcastPreflight.payload !== params.payloadPath) {
    failures.push("broadcast preflight payload path must match payload argument");
  }
  if (broadcastPreflight.signer !== signedPayloadVerification.preflight.signer) {
    failures.push("broadcast preflight signer must match signed payload preflight");
  }
  if (broadcastPreflight.expectedChainId !== signedPayloadVerification.preflight.chainId) {
    failures.push("broadcast preflight chainId must match signed payload preflight");
  }
  if (broadcastPreflight.expectedNonce !== signedPayloadVerification.preflight.nonceStart) {
    failures.push("broadcast preflight nonce must match signed payload preflight");
  }
  if (broadcastPreflight.transactions !== signedPayloadVerification.preflight.transactions) {
    failures.push("broadcast preflight transaction count must match signed payload preflight");
  }
  if (broadcastPreflight.pendingNonce !== broadcastPreflight.expectedNonce) {
    failures.push("broadcast preflight pending nonce must match expected nonce");
  }
}

function parseBroadcastPreflight(
  json: string,
  failures: string[],
): AgentProposalExecutionBroadcastPreflightReport | null {
  try {
    const value = JSON.parse(json);
    if (!isRecord(value)) {
      failures.push("broadcast preflight must be a JSON object");
      return null;
    }
    return value as unknown as AgentProposalExecutionBroadcastPreflightReport;
  } catch (error) {
    failures.push(`broadcast preflight JSON is malformed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function parseSignedPayload(json: string, failures: string[]): SignedPayloadArtifact | null {
  try {
    const value = JSON.parse(json);
    if (!isRecord(value)) {
      failures.push("signed payload must be a JSON object");
      return null;
    }
    if (!Array.isArray(value.transactions)) {
      failures.push("signed payload transactions must be an array");
      return null;
    }
    return value as unknown as SignedPayloadArtifact;
  } catch (error) {
    failures.push(`signed payload JSON is malformed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function file(path: string, contents: string): AgentProposalExecutionBroadcastPackageFile {
  return {
    path,
    sha256: sha256(contents),
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function uniqueFailures(failures: string[]): string[] {
  return [...new Set(failures)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
