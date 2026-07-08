import { createHash } from "node:crypto";

import { verifyAgentProposalExecutionBundle } from "./bundleVerify.js";

import type { AgentProposalExecutionBundle } from "./bundle.js";
import type {
  AgentProposalExecutionBundleVerification,
  VerifyAgentProposalExecutionBundleParams,
} from "./bundleVerify.js";

export interface CreateAgentProposalExecutionPreviewParams extends VerifyAgentProposalExecutionBundleParams {
  bundlePath: string;
  generatedAt?: string | undefined;
}

export interface AgentProposalExecutionPreviewResult {
  passed: boolean;
  failures: string[];
  verification: AgentProposalExecutionBundleVerification;
  preview: AgentProposalExecutionPreview | null;
}

export interface AgentProposalExecutionPreview {
  schemaVersion: 1;
  generatedAt: string;
  chainId: number;
  objective: string;
  agent: string;
  bundle: {
    path: string;
    sha256: string;
  };
  transactions: AgentProposalExecutionPreviewTransaction[];
}

export interface AgentProposalExecutionPreviewTransaction {
  index: number;
  stepId: string;
  title: string;
  to: string;
  value: string;
  dataSha256: string;
  dataBytes: number;
}

export function createAgentProposalExecutionPreview(
  params: CreateAgentProposalExecutionPreviewParams,
): AgentProposalExecutionPreviewResult {
  const verification = verifyAgentProposalExecutionBundle(params);
  if (!verification.passed) {
    return {
      passed: false,
      failures: verification.failures,
      verification,
      preview: null,
    };
  }

  const bundle = JSON.parse(params.bundleJson) as AgentProposalExecutionBundle;
  return {
    passed: true,
    failures: [],
    verification,
    preview: {
      schemaVersion: 1,
      generatedAt: params.generatedAt ?? new Date().toISOString(),
      chainId: bundle.chainId,
      objective: bundle.objective,
      agent: bundle.agent,
      bundle: {
        path: params.bundlePath,
        sha256: sha256(params.bundleJson),
      },
      transactions: bundle.transactions.map((transaction, index) => ({
        index,
        stepId: transaction.stepId,
        title: transaction.title,
        to: transaction.to,
        value: transaction.value,
        dataSha256: sha256(transaction.data),
        dataBytes: byteLength(transaction.data),
      })),
    },
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function byteLength(hex: string): number {
  if (!hex.startsWith("0x")) return 0;
  return Math.floor((hex.length - 2) / 2);
}
