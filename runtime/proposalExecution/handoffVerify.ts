import { verifyAgentProposalExecutionManifest } from "./manifestVerify.js";
import { verifyAgentProposalExecutionPackage } from "./packageVerify.js";

import type { AgentProposalExecutionManifestVerification } from "./manifestVerify.js";
import type {
  AgentProposalExecutionPackageVerification,
  VerifyAgentProposalExecutionPackageParams,
} from "./packageVerify.js";

export interface VerifyAgentProposalExecutionHandoffParams extends VerifyAgentProposalExecutionPackageParams {
  executionManifestJson: string;
}

export interface AgentProposalExecutionHandoffVerificationCheck {
  name: "execution-package" | "execution-manifest";
  passed: boolean;
  failures: string[];
}

export interface AgentProposalExecutionHandoffVerification {
  passed: boolean;
  failures: string[];
  checks: AgentProposalExecutionHandoffVerificationCheck[];
  packageVerification: AgentProposalExecutionPackageVerification;
  executionManifestVerification: AgentProposalExecutionManifestVerification;
}

export function verifyAgentProposalExecutionHandoff(
  params: VerifyAgentProposalExecutionHandoffParams,
): AgentProposalExecutionHandoffVerification {
  const packageVerification = verifyAgentProposalExecutionPackage(params);
  const executionManifestVerification = verifyAgentProposalExecutionManifest(params);
  const checks: AgentProposalExecutionHandoffVerificationCheck[] = [
    {
      name: "execution-package",
      passed: packageVerification.passed,
      failures: packageVerification.failures,
    },
    {
      name: "execution-manifest",
      passed: executionManifestVerification.passed,
      failures: executionManifestVerification.failures,
    },
  ];

  return {
    passed: checks.every((check) => check.passed),
    failures: uniqueFailures(checks.flatMap((check) => check.failures)),
    checks,
    packageVerification,
    executionManifestVerification,
  };
}

function uniqueFailures(failures: string[]): string[] {
  return [...new Set(failures)];
}
