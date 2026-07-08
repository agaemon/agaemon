import { verifyAgentProposalArtifact } from "./verify.js";

export interface CreateAgentProposalSummaryParams {
  proposalPath: string;
  proposalJson: string;
}

export interface AgentProposalSummary {
  passed: boolean;
  failures: string[];
  markdown: string;
  source: "plan" | "intent" | null;
  sourcePath: string | null;
  executable: boolean | null;
  steps: number;
  transactions: number;
}

interface ProposalArtifact {
  chainId: number;
  plan?: string;
  intent?: string;
  executable: boolean;
  steps: ProposalArtifactStep[];
}

interface ProposalArtifactStep {
  id: string;
  title: string;
  action: {
    target: string;
    valueWei: string;
  };
  decision: {
    allowed: boolean;
    code: string;
  };
  transaction: unknown | null;
}

export function createAgentProposalSummary(params: CreateAgentProposalSummaryParams): AgentProposalSummary {
  const verification = verifyAgentProposalArtifact(params.proposalJson);
  if (!verification.passed) {
    return {
      passed: false,
      failures: verification.failures,
      markdown: "",
      source: verification.source,
      sourcePath: verification.sourcePath,
      executable: verification.executable,
      steps: verification.steps,
      transactions: verification.transactions,
    };
  }

  const artifact = JSON.parse(params.proposalJson) as ProposalArtifact;
  return {
    passed: true,
    failures: [],
    markdown: renderMarkdown(params.proposalPath, artifact, verification),
    source: verification.source,
    sourcePath: verification.sourcePath,
    executable: verification.executable,
    steps: verification.steps,
    transactions: verification.transactions,
  };
}

function renderMarkdown(
  proposalPath: string,
  artifact: ProposalArtifact,
  verification: ReturnType<typeof verifyAgentProposalArtifact>,
): string {
  const rows = [
    "# Agent Proposal Review",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Proposal | ${escapeCell(proposalPath)} |`,
    `| Source | ${escapeCell(`${verification.source}: ${verification.sourcePath}`)} |`,
    `| Chain ID | ${artifact.chainId} |`,
    `| Executable | ${artifact.executable ? "yes" : "no"} |`,
    `| Steps | ${artifact.steps.length} |`,
    `| Allowed Decisions | ${countDecisions(artifact, true)} |`,
    `| Denied Decisions | ${countDecisions(artifact, false)} |`,
    `| Transactions | ${verification.transactions} |`,
    "",
    "| Step | Title | Decision | Target | Value Wei | Transaction |",
    "| --- | --- | --- | --- | --- | --- |",
    ...artifact.steps.map((step) => {
      const cells = [
        escapeCell(step.id),
        escapeCell(step.title),
        escapeCell(step.decision.code),
        escapeCell(step.action.target),
        escapeCell(step.action.valueWei),
        step.transaction === null ? "suppressed" : "present",
      ];
      return `| ${cells.join(" | ")} |`;
    }),
    "",
  ];
  return rows.join("\n");
}

function countDecisions(artifact: ProposalArtifact, allowed: boolean): number {
  return artifact.steps.filter((step) => step.decision.allowed === allowed).length;
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replace(/\r?\n/g, " ");
}
