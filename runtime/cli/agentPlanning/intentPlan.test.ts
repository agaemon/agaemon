import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type IntentPlanCliModule = typeof import("./intentPlan.js") & {
  isIntentPlanDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseIntentPlanCliArgs?: (argv: readonly string[]) => {
    intentPath: string;
    manifestPath: string;
    outputPath?: string | undefined;
  };
  runIntentPlanCli?: (options?: {
    argv?: readonly string[];
    writeOutput?: (output: string) => void;
    readManifest?: (path: string) => Promise<unknown>;
    readText?: (path: string) => string;
    parseIntentDocument?: (value: unknown) => unknown;
    createPlan?: (params: unknown) => { steps: readonly unknown[] };
    formatPlan?: (plan: { steps: readonly unknown[] }) => unknown;
    mkdirp?: (dir: string) => Promise<void>;
    writeText?: (path: string, contents: string) => Promise<void>;
  }) => Promise<void>;
};

const FORMATTED_PLAN = {
  objective: "Pay the contributor",
  steps: [
    {
      id: "step-1",
      title: "Pay",
      action: {
        capability: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        target: "0x1111111111111111111111111111111111111111",
        valueWei: "1",
        data: "0x",
        usesBorrowing: false,
      },
    },
  ],
};

describe("isIntentPlanDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./intentPlan.js") as IntentPlanCliModule;
    const scriptPath = resolve("runtime/cli/agentPlanning/intentPlan.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isIntentPlanDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isIntentPlanDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isIntentPlanDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/agentPlanning/intentProposal.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./intentPlan.js") as IntentPlanCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/agentPlanning/intentPlan.ts")).href;

    expect(() => module.isIntentPlanDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseIntentPlanCliArgs", () => {
  it("requires an intent path", async () => {
    const module = await import("./intentPlan.js") as IntentPlanCliModule;

    expect(() => module.parseIntentPlanCliArgs?.([])).toThrow("--intent is required");
  });

  it("parses split and equals-form intent plan flags", async () => {
    const module = await import("./intentPlan.js") as IntentPlanCliModule;

    expect(module.parseIntentPlanCliArgs?.([
      "--intent",
      "docs/intent.json",
      "--manifest=deployments/base-sepolia/custom.json",
      "--output",
      "artifacts/intent-plan.json",
    ])).toEqual({
      intentPath: "docs/intent.json",
      manifestPath: "deployments/base-sepolia/custom.json",
      outputPath: "artifacts/intent-plan.json",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./intentPlan.js") as IntentPlanCliModule;

    expect(() => module.parseIntentPlanCliArgs?.(["--intent", "a.json", "--intent", "b.json"])).toThrow(
      "Duplicate argument: --intent",
    );
    expect(() => module.parseIntentPlanCliArgs?.(["--intent"])).toThrow("--intent requires a value");
    expect(() => module.parseIntentPlanCliArgs?.(["--intent", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runIntentPlanCli", () => {
  it("prints injected formatted intent plans when no output path is provided", async () => {
    const module = await import("./intentPlan.js") as IntentPlanCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runIntentPlanCli?.({
      argv: ["--intent", "docs/intent.json"],
      writeOutput: (output) => outputs.push(output),
      readManifest: async (path) => {
        calls.push(`manifest:${path}`);
        return { manifest: true };
      },
      readText: (path) => {
        calls.push(`read:${path}`);
        return "{\"objective\":\"Pay\"}";
      },
      parseIntentDocument: (value) => {
        calls.push(`parse:${typeof value}`);
        return { objective: "Pay", intents: [] };
      },
      createPlan: (params) => {
        calls.push(`plan:${typeof params}`);
        return { steps: FORMATTED_PLAN.steps };
      },
      formatPlan: (plan) => {
        calls.push(`format:${plan.steps.length}`);
        return FORMATTED_PLAN;
      },
      mkdirp: async () => {
        throw new Error("mkdirp should not be called");
      },
      writeText: async () => {
        throw new Error("writeText should not be called");
      },
    });

    expect(outputs).toEqual([JSON.stringify(FORMATTED_PLAN, null, 2)]);
    expect(calls).toEqual([
      "manifest:deployments/base-sepolia/latest.json",
      "read:docs/intent.json",
      "parse:object",
      "plan:object",
      "format:1",
    ]);
  });

  it("writes injected formatted intent plans and emits write summaries", async () => {
    const module = await import("./intentPlan.js") as IntentPlanCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runIntentPlanCli?.({
      argv: ["--intent", "docs/intent.json", "--output", "artifacts/intent-plan.json"],
      writeOutput: (output) => outputs.push(output),
      readManifest: async () => ({}),
      readText: () => "{}",
      parseIntentDocument: () => ({ objective: "Pay", intents: [] }),
      createPlan: () => ({ steps: FORMATTED_PLAN.steps }),
      formatPlan: () => FORMATTED_PLAN,
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    expect(outputs).toEqual([JSON.stringify({
      intent: "docs/intent.json",
      manifest: "deployments/base-sepolia/latest.json",
      output: "artifacts/intent-plan.json",
      steps: 1,
      written: true,
    }, null, 2)]);
    expect(calls).toEqual([
      `mkdir:artifacts`,
      `write:artifacts/intent-plan.json:${JSON.stringify(FORMATTED_PLAN, null, 2)}\n`,
    ]);
  });

  it("rejects malformed arguments before reads or writes", async () => {
    const module = await import("./intentPlan.js") as IntentPlanCliModule;
    const calls: string[] = [];

    await expect(module.runIntentPlanCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readManifest: async () => {
        calls.push("manifest");
        return {};
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected formatted plans before output or artifact writes", async () => {
    const module = await import("./intentPlan.js") as IntentPlanCliModule;
    const calls: string[] = [];

    await expect(module.runIntentPlanCli?.({
      argv: ["--intent", "docs/intent.json", "--output", "artifacts/intent-plan.json"],
      writeOutput: () => calls.push("output"),
      readManifest: async () => ({}),
      readText: () => "{}",
      parseIntentDocument: () => ({ objective: "Pay", intents: [] }),
      createPlan: () => ({ steps: FORMATTED_PLAN.steps }),
      formatPlan: () => ({
        objective: "Pay",
        steps: [
          {
            id: "step-1",
            title: "Pay",
            action: {
              capability: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              target: "0x1111111111111111111111111111111111111111",
              valueWei: "1",
              data: "0x",
              usesBorrowing: "false",
            },
          },
        ],
      }),
      mkdirp: async () => {
        calls.push("mkdir");
      },
      writeText: async () => {
        calls.push("write");
      },
    })).rejects.toThrow("Intent plan report steps[0] action usesBorrowing must be a boolean");
    expect(calls).toEqual([]);
  });
});
