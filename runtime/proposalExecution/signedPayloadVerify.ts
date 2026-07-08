import { createHash } from "node:crypto";

import { isHex, parseTransaction, recoverTransactionAddress } from "viem";

import { verifyAgentProposalExecutionSigningPayloadPreflight } from "./signingPayloadPreflight.js";

import type { AgentProposalExecutionSigningPayload } from "./signingPayload.js";
import type {
  AgentProposalExecutionSigningPayloadPreflightReport,
  VerifyAgentProposalExecutionSigningPayloadPreflightParams,
} from "./signingPayloadPreflight.js";
import type { TransactionSerialized } from "viem";

export interface VerifyAgentProposalExecutionSignedPayloadParams
  extends VerifyAgentProposalExecutionSigningPayloadPreflightParams {
  signedPayloadPath: string;
  signedPayloadJson: string;
}

export interface AgentProposalExecutionSignedPayloadVerification {
  passed: boolean;
  failures: string[];
  preflight: AgentProposalExecutionSigningPayloadPreflightReport;
}

interface SignedPayloadArtifact {
  schemaVersion: 1;
  signingPayload: {
    path: string;
    sha256: string;
  };
  signer: string;
  chainId: number;
  transactions: SignedPayloadTransaction[];
}

interface SignedPayloadTransaction {
  index: number;
  rawTransaction: string;
}

export async function verifyAgentProposalExecutionSignedPayload(
  params: VerifyAgentProposalExecutionSignedPayloadParams,
): Promise<AgentProposalExecutionSignedPayloadVerification> {
  const preflight = verifyAgentProposalExecutionSigningPayloadPreflight(params);
  const failures = [...preflight.checks.flatMap((check) => check.failures)];
  const payload = parseSigningPayload(params.payloadJson, failures);
  const signedPayload = parseSignedPayload(params.signedPayloadJson, failures);

  if (payload !== null && signedPayload !== null) {
    validateArtifactMetadata(params, payload, signedPayload, failures);
    await validateSignedTransactions(payload, signedPayload, failures);
  }

  return {
    passed: preflight.passed && failures.length === 0,
    failures: uniqueFailures(failures),
    preflight,
  };
}

function parseSigningPayload(json: string, failures: string[]): AgentProposalExecutionSigningPayload | null {
  try {
    const payload = JSON.parse(json);
    if (!isRecord(payload)) {
      failures.push("signing payload must be a JSON object");
      return null;
    }
    return payload as unknown as AgentProposalExecutionSigningPayload;
  } catch (error) {
    failures.push(`signing payload JSON is malformed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function parseSignedPayload(json: string, failures: string[]): SignedPayloadArtifact | null {
  try {
    const payload = JSON.parse(json);
    if (!isRecord(payload)) {
      failures.push("signed payload must be a JSON object");
      return null;
    }
    return payload as unknown as SignedPayloadArtifact;
  } catch (error) {
    failures.push(`signed payload JSON is malformed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function validateArtifactMetadata(
  params: VerifyAgentProposalExecutionSignedPayloadParams,
  payload: AgentProposalExecutionSigningPayload,
  signedPayload: SignedPayloadArtifact,
  failures: string[],
): void {
  if (signedPayload.schemaVersion !== 1) failures.push("signed payload schemaVersion must be 1");
  if (!isRecord(signedPayload.signingPayload)) {
    failures.push("signed payload signingPayload must be an object");
  } else {
    if (signedPayload.signingPayload.path !== params.payloadPath) {
      failures.push("signed payload signingPayload.path must match payload path");
    }
    if (signedPayload.signingPayload.sha256 !== sha256(params.payloadJson)) {
      failures.push("signed payload signingPayload.sha256 must match payload JSON");
    }
  }
  if (typeof signedPayload.signer !== "string" || signedPayload.signer.toLowerCase() !== payload.signer.toLowerCase()) {
    failures.push("signed payload signer must match signing payload signer");
  }
  if (signedPayload.chainId !== payload.chainId) failures.push("signed payload chainId must match signing payload chainId");
  if (!Array.isArray(signedPayload.transactions)) {
    failures.push("signed payload transactions must be an array");
    return;
  }
  if (signedPayload.transactions.length !== payload.transactions.length) {
    failures.push("signed payload transaction count must match signing payload transaction count");
  }
}

async function validateSignedTransactions(
  payload: AgentProposalExecutionSigningPayload,
  signedPayload: SignedPayloadArtifact,
  failures: string[],
): Promise<void> {
  if (!Array.isArray(signedPayload.transactions)) return;
  for (const expected of payload.transactions) {
    const signedTransaction = signedPayload.transactions[expected.index];
    if (!isRecord(signedTransaction)) {
      failures.push(`signed transaction ${expected.index} must be an object`);
      continue;
    }
    if (signedTransaction.index !== expected.index) {
      failures.push(`signed transaction ${expected.index} index must match position`);
    }
    if (typeof signedTransaction.rawTransaction !== "string" || !isHex(signedTransaction.rawTransaction)) {
      failures.push(`signed transaction ${expected.index} rawTransaction must be hex`);
      continue;
    }

    try {
      const rawTransaction = signedTransaction.rawTransaction as TransactionSerialized;
      const parsed = parseTransaction(rawTransaction);
      const recovered = await recoverTransactionAddress({ serializedTransaction: rawTransaction });
      if (recovered.toLowerCase() !== payload.signer.toLowerCase()) {
        failures.push(`signed transaction ${expected.index} signer does not match signing payload`);
      }
      if (parsed.chainId !== payload.chainId) {
        failures.push(`signed transaction ${expected.index} chainId does not match signing payload`);
      }
      if (parsed.nonce !== expected.nonce) {
        failures.push(`signed transaction ${expected.index} nonce does not match signing payload`);
      }
      if ((parsed.to ?? "").toLowerCase() !== expected.to.toLowerCase()) {
        failures.push(`signed transaction ${expected.index} target does not match signing payload`);
      }
      if ((parsed.value ?? 0n) !== BigInt(expected.value)) {
        failures.push(`signed transaction ${expected.index} value does not match signing payload`);
      }
      if ((parsed.data ?? "0x").toLowerCase() !== expected.data.toLowerCase()) {
        failures.push(`signed transaction ${expected.index} calldata does not match signing payload`);
      }
      if ((parsed.gas ?? 0n) !== BigInt(expected.gasLimit)) {
        failures.push(`signed transaction ${expected.index} gas limit does not match signing payload`);
      }
    } catch (error) {
      failures.push(`signed transaction ${expected.index} is malformed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function uniqueFailures(failures: string[]): string[] {
  return [...new Set(failures)];
}
