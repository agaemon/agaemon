import { createAgentProposalExecutionBundle } from "../proposalExecution/bundle.js";
import { createAgentProposalExecutionHandoff } from "../proposalExecution/handoff.js";
import { createAgentProposalReviewApproval } from "../proposalReview/approval.js";
import { createAgentProposalReviewPackage } from "../proposalReview/package.js";

import type {
  AgentProposalExecutionBundleResult,
} from "../proposalExecution/bundle.js";
import type {
  AgentProposalExecutionHandoff,
} from "../proposalExecution/handoff.js";
import type {
  AgentProposalReviewDecision,
  AgentProposalReviewApprovalResult,
} from "../proposalReview/approval.js";
import type {
  AgentProposalReviewPackage,
} from "../proposalReview/package.js";

export interface CreateAgentOsLocalWorkflowPackageParams {
  proposalPath: string;
  proposalJson: string;
  summaryPath: string;
  summaryMarkdown?: string | undefined;
  manifestPath: string;
  approvalPath: string;
  bundlePath: string;
  previewPath: string;
  runbookPath: string;
  executionManifestPath: string;
  reviewer: string;
  decision: AgentProposalReviewDecision;
  generatedAt?: string | undefined;
}

export interface AgentOsLocalWorkflowPackageFiles {
  summary: {
    path: string;
    markdown: string;
  };
  reviewManifest: {
    path: string;
    json: string;
  };
  approval: {
    path: string;
    json: string;
  };
  executionBundle: {
    path: string;
    json: string;
  };
  executionPreview: {
    path: string;
    json: string;
  };
  executionRunbook: {
    path: string;
    markdown: string;
  };
  executionManifest: {
    path: string;
    json: string;
  };
}

export interface AgentOsLocalWorkflowPackage {
  passed: boolean;
  failures: string[];
  reviewPackage: AgentProposalReviewPackage;
  approval: AgentProposalReviewApprovalResult | null;
  executionBundle: AgentProposalExecutionBundleResult | null;
  executionHandoff: AgentProposalExecutionHandoff | null;
  files: AgentOsLocalWorkflowPackageFiles;
}

export function createAgentOsLocalWorkflowPackage(
  params: CreateAgentOsLocalWorkflowPackageParams,
): AgentOsLocalWorkflowPackage {
  const reviewPackage = createAgentProposalReviewPackage(params);
  const files = createEmptyFiles(params, reviewPackage.summary.markdown);

  if (!reviewPackage.passed || reviewPackage.manifest === null) {
    return {
      passed: false,
      failures: reviewPackage.failures,
      reviewPackage,
      approval: null,
      executionBundle: null,
      executionHandoff: null,
      files,
    };
  }

  files.reviewManifest.json = `${JSON.stringify(reviewPackage.manifest, null, 2)}\n`;

  const approval = createAgentProposalReviewApproval({
    ...params,
    manifestJson: files.reviewManifest.json,
    summaryMarkdown: reviewPackage.summary.markdown,
  });

  if (!approval.passed || approval.approval === null) {
    return {
      passed: false,
      failures: approval.failures,
      reviewPackage,
      approval,
      executionBundle: null,
      executionHandoff: null,
      files,
    };
  }

  files.approval.json = `${JSON.stringify(approval.approval, null, 2)}\n`;

  if (approval.approval.decision !== "approved") {
    return {
      passed: true,
      failures: [],
      reviewPackage,
      approval,
      executionBundle: null,
      executionHandoff: null,
      files,
    };
  }

  const executionBundle = createAgentProposalExecutionBundle({
    ...params,
    approvalJson: files.approval.json,
    manifestJson: files.reviewManifest.json,
    summaryMarkdown: reviewPackage.summary.markdown,
  });

  if (!executionBundle.passed || executionBundle.bundle === null) {
    return {
      passed: false,
      failures: executionBundle.failures,
      reviewPackage,
      approval,
      executionBundle,
      executionHandoff: null,
      files,
    };
  }

  files.executionBundle.json = `${JSON.stringify(executionBundle.bundle, null, 2)}\n`;

  const executionHandoff = createAgentProposalExecutionHandoff({
    ...params,
    bundleJson: files.executionBundle.json,
    approvalJson: files.approval.json,
    manifestJson: files.reviewManifest.json,
    summaryMarkdown: reviewPackage.summary.markdown,
  });

  files.executionPreview.json = executionHandoff.preview.json;
  files.executionRunbook.markdown = executionHandoff.runbook.markdown;
  files.executionManifest.json = executionHandoff.executionManifest.json;

  return {
    passed: executionHandoff.passed,
    failures: executionHandoff.failures,
    reviewPackage,
    approval,
    executionBundle,
    executionHandoff,
    files,
  };
}

function createEmptyFiles(
  params: CreateAgentOsLocalWorkflowPackageParams,
  summaryMarkdown: string,
): AgentOsLocalWorkflowPackageFiles {
  return {
    summary: {
      path: params.summaryPath,
      markdown: summaryMarkdown,
    },
    reviewManifest: {
      path: params.manifestPath,
      json: "",
    },
    approval: {
      path: params.approvalPath,
      json: "",
    },
    executionBundle: {
      path: params.bundlePath,
      json: "",
    },
    executionPreview: {
      path: params.previewPath,
      json: "",
    },
    executionRunbook: {
      path: params.runbookPath,
      markdown: "",
    },
    executionManifest: {
      path: params.executionManifestPath,
      json: "",
    },
  };
}
