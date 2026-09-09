import { describe, expect, it } from "vitest";

import { runPlanProposalCli } from "./planProposal.js";
import { runIntentProposalCli } from "./intentProposal.js";

const AGENT = "0x0000000000000000000000000000000000000a01";
const TARGET = "0x0000000000000000000000000000000000000b01";
const CAPABILITY = `0x${"11".repeat(32)}`;
const MANIFEST = {
  chainId: 84532,
  rpcUrlEnv: "BASE_SEPOLIA_RPC_URL",
  contracts: { agentAccount: AGENT, treasuryPaymentAdapter: TARGET },
};

describe("proposal CLI sequence validation", () => {
  for (const source of ["plan", "intent"] as const) {
    it.each([false, true])(`${source} retains diagnostics and exits 1 (write=%s)`, async (write) => {
      const output: string[] = [];
      const exitCodes: number[] = [];
      const written: string[] = [];
      const steps = [1, 2].map((id) => ({
        id: `step-${id}`, title: "Pay ten units",
        action: { capability: CAPABILITY, target: TARGET, valueWei: "10", data: "0x", usesBorrowing: false },
      }));
      const intents = [1, 2].map((id) => ({
        id: `payment-${id}`, title: "Pay ten units", type: "treasury-payment",
        recipient: TARGET, amountWei: "10",
      }));
      const options = {
        argv: [`--${source}`, `${source}.json`, ...(write ? ["--output", "proposal.json"] : [])],
        env: { BASE_SEPOLIA_RPC_URL: "https://rpc.invalid" },
        loadDotEnv: () => {},
        readManifest: async () => MANIFEST,
        createPublicClient: () => ({ getChainId: async () => 84532 }),
        createPolicySimulator: () => async () => ({ allowed: true, code: "Allowed" }),
        readText: () => JSON.stringify({ objective: "Review a sequence", ...(source === "plan" ? { steps } : { intents }) }),
        writeOutput: (value: string) => { output.push(value); },
        setExitCode: (code: number) => { exitCodes.push(code); },
        mkdirp: async () => {},
        writeText: async (_path: string, contents: string) => { written.push(contents); },
      };
      await (source === "plan" ? runPlanProposalCli(options) : runIntentProposalCli(options));

      expect(exitCodes).toEqual([1]);
      const report = JSON.parse(write ? written[0]! : output[0]!);
      expect(report.validationStatus).toBe("sequence-unverified");
      expect(report.executable).toBe(false);
      expect(report.steps.map((step: { decision: { allowed: boolean } }) => step.decision.allowed)).toEqual([true, true]);
      expect(report.steps.map((step: { transaction: unknown }) => step.transaction)).toEqual([null, null]);
      if (write) {
        expect(JSON.parse(output[0]!)).toMatchObject({
          written: true, executable: false, validationStatus: "sequence-unverified", steps: 2,
        });
      }
    });
  }
});
