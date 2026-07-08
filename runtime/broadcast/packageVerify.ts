import { isDeepStrictEqual } from "node:util";

import { createAgentProposalExecutionBroadcastPackage } from "./package.js";

import type {
  AgentProposalExecutionBroadcastPackage,
  AgentProposalExecutionBroadcastPackageResult,
  CreateAgentProposalExecutionBroadcastPackageParams,
} from "./package.js";

export interface VerifyAgentProposalExecutionBroadcastPackageParams
  extends CreateAgentProposalExecutionBroadcastPackageParams {
  broadcastPackagePath: string;
  broadcastPackageJson: string;
}

export interface AgentProposalExecutionBroadcastPackageVerification {
  passed: boolean;
  failures: string[];
  packageResult: AgentProposalExecutionBroadcastPackageResult;
}

export async function verifyAgentProposalExecutionBroadcastPackage(
  params: VerifyAgentProposalExecutionBroadcastPackageParams,
): Promise<AgentProposalExecutionBroadcastPackageVerification> {
  const failures: string[] = [];
  const savedPackage = parseBroadcastPackage(params.broadcastPackageJson, failures);
  const packageResult = await createAgentProposalExecutionBroadcastPackage({
    ...params,
    generatedAt: params.generatedAt ?? savedPackage?.generatedAt,
  });

  failures.push(...packageResult.failures);
  if (savedPackage !== null && packageResult.package !== null && !isDeepStrictEqual(savedPackage, packageResult.package)) {
    failures.push("broadcast package JSON does not match current broadcast package");
  }

  return {
    passed: failures.length === 0,
    failures: uniqueFailures(failures),
    packageResult,
  };
}

function parseBroadcastPackage(json: string, failures: string[]): AgentProposalExecutionBroadcastPackage | null {
  try {
    const value = JSON.parse(json);
    if (!isRecord(value)) {
      failures.push("broadcast package must be a JSON object");
      return null;
    }
    if (value.schemaVersion !== 1) failures.push("broadcast package schemaVersion must be 1");
    if (typeof value.generatedAt !== "string" || Number.isNaN(Date.parse(value.generatedAt))) {
      failures.push("broadcast package generatedAt must be a valid timestamp");
    }
    return value as unknown as AgentProposalExecutionBroadcastPackage;
  } catch (error) {
    failures.push(`broadcast package JSON is malformed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function uniqueFailures(failures: string[]): string[] {
  return [...new Set(failures)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
