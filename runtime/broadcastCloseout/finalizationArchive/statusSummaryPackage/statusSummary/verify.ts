import { createPackageStatusSummary } from "./summary.js";

import type {
  CreatePackageStatusSummaryParams,
} from "./summary.js";

export interface VerifyPackageStatusSummaryParams
  extends CreatePackageStatusSummaryParams {
  finalizationArchiveStatusSummaryPackageStatusSummaryMarkdown: string;
}

export interface PackageStatusSummaryVerification {
  passed: boolean;
  failures: string[];
  expected: string;
}

export function verifyPackageStatusSummary(
  params: VerifyPackageStatusSummaryParams,
): PackageStatusSummaryVerification {
  const summary = createPackageStatusSummary(params);
  if (!summary.passed) {
    return {
      passed: false,
      failures: summary.failures,
      expected: "",
    };
  }

  const failures = params.finalizationArchiveStatusSummaryPackageStatusSummaryMarkdown === summary.markdown
    ? []
    : [
      "closeout finalization archive status summary package status summary Markdown does not match current finalization archive status summary package status evidence",
    ];

  return {
    passed: failures.length === 0,
    failures,
    expected: summary.markdown,
  };
}
