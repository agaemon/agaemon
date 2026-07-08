import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";

import {
  BASE_READINESS_SCRIPTS,
  buildBaseReadinessChecks,
  createChildProcessReadinessRunner,
  formatBaseReadinessSummary,
  runBaseReadinessChecks,
  validateBaseReadinessPackageScripts,
} from "./readiness.js";

function readPackageJson(): unknown {
  return JSON.parse(readFileSync("package.json", "utf8"));
}

describe("base readiness", () => {
  it("builds the default readiness checks in deterministic order", () => {
    const checks = buildBaseReadinessChecks();

    expect(checks.map((check) => check.script)).toEqual(BASE_READINESS_SCRIPTS.map((script) => script.script));
    expect(checks[0]).toEqual({
      name: "manifest",
      script: "base:manifest-verify",
      command: "npm",
      args: ["run", "base:manifest-verify", "--", "--summary"],
    });
    expect(checks.map((check) => check.script)).toContain("base:agent-coordination-safety-check");
    expect(checks.map((check) => check.script)).toContain("base:reputation-score-sync-safety-check");
    expect(checks.map((check) => check.script)).toContain("base:token-safety-check");
  });

  it("forwards manifest path to every child command after npm's argument separator", () => {
    const checks = buildBaseReadinessChecks({ manifestPath: "deployments/base-sepolia/latest.json" });

    expect(checks[0]!.args).toEqual([
      "run",
      "base:manifest-verify",
      "--",
      "--summary",
      "--manifest",
      "deployments/base-sepolia/latest.json",
    ]);
    expect(checks[1]!.args).toEqual([
      "run",
      "base:agent-account-safety-check",
      "--",
      "--manifest",
      "deployments/base-sepolia/latest.json",
    ]);
  });

  it("rejects malformed readiness builder options", () => {
    expect(() => buildBaseReadinessChecks(null as never)).toThrow("readiness build options must be an object");
    expect(() => buildBaseReadinessChecks([] as never)).toThrow("readiness build options must be an object");
  });

  it("rejects malformed readiness builder manifest paths", () => {
    expect(() => buildBaseReadinessChecks({ manifestPath: 7 } as never)).toThrow(
      "readiness manifest path must be a string",
    );
    expect(() => buildBaseReadinessChecks({ manifestPath: "  " })).toThrow(
      "readiness manifest path must not be empty",
    );
  });

  it("trims readiness builder manifest paths before forwarding", () => {
    const checks = buildBaseReadinessChecks({ manifestPath: "  deployments/base-sepolia/latest.json  " });

    expect(checks[0]!.args).toEqual([
      "run",
      "base:manifest-verify",
      "--",
      "--summary",
      "--manifest",
      "deployments/base-sepolia/latest.json",
    ]);
  });

  it("rejects malformed readiness builder script lists", () => {
    expect(() => buildBaseReadinessChecks({ readinessScripts: "base:manifest-verify" } as never)).toThrow(
      "readiness scripts must be an array",
    );
  });

  it("rejects malformed readiness builder script entries", () => {
    expect(() => buildBaseReadinessChecks({ readinessScripts: [{ script: "base:manifest-verify" }] } as never)).toThrow(
      "readiness script name must be a string",
    );
    expect(() => buildBaseReadinessChecks({ readinessScripts: [{ name: "manifest", script: 7 }] } as never)).toThrow(
      "readiness script manifest script must be a string",
    );
  });

  it("rejects empty readiness builder script names and values", () => {
    expect(() => buildBaseReadinessChecks({ readinessScripts: [{ name: "", script: "base:manifest-verify" }] })).toThrow(
      "readiness script name must not be empty",
    );
    expect(() => buildBaseReadinessChecks({ readinessScripts: [{ name: "manifest", script: "  " }] })).toThrow(
      "readiness script manifest script must not be empty",
    );
  });

  it("rejects malformed readiness builder args", () => {
    expect(() =>
      buildBaseReadinessChecks({
        readinessScripts: [{ name: "manifest", script: "base:manifest-verify", args: "--summary" }],
      } as never),
    ).toThrow("readiness script manifest args must be an array");
    expect(() =>
      buildBaseReadinessChecks({
        readinessScripts: [{ name: "manifest", script: "base:manifest-verify", args: ["--summary", 7] }],
      } as never),
    ).toThrow("readiness script manifest arg 1 must be a string");
    expect(() =>
      buildBaseReadinessChecks({
        readinessScripts: [{ name: "manifest", script: "base:manifest-verify", args: ["--summary", " "] }],
      }),
    ).toThrow("readiness script manifest arg 1 must not be empty");
  });

  it("builds injected readiness scripts with the same command shape as default scripts", () => {
    const checks = buildBaseReadinessChecks({
      manifestPath: "deployments/base-sepolia/latest.json",
      readinessScripts: [
        { name: "manifest", script: "base:manifest-verify", args: ["--summary"] },
        { name: "payment", script: "base:safety-check" },
      ],
    });

    expect(checks).toEqual([
      {
        name: "manifest",
        script: "base:manifest-verify",
        command: "npm",
        args: [
          "run",
          "base:manifest-verify",
          "--",
          "--summary",
          "--manifest",
          "deployments/base-sepolia/latest.json",
        ],
      },
      {
        name: "payment",
        script: "base:safety-check",
        command: "npm",
        args: [
          "run",
          "base:safety-check",
          "--",
          "--manifest",
          "deployments/base-sepolia/latest.json",
        ],
      },
    ]);
  });

  it("runs checks sequentially and marks non-zero exits as failed", async () => {
    const checks = buildBaseReadinessChecks().slice(0, 3);
    const calls: string[] = [];

    const results = await runBaseReadinessChecks(checks, async (check) => {
      calls.push(check.script);
      return {
        exitCode: check.script === "base:agent-account-safety-check" ? 1 : 0,
        signal: null,
        stdout: `${check.script} stdout`,
        stderr: "",
      };
    });

    expect(calls).toEqual(["base:manifest-verify", "base:agent-account-safety-check", "base:agent-directory-safety-check"]);
    expect(results.map((result) => ({ script: result.script, passed: result.passed }))).toEqual([
      { script: "base:manifest-verify", passed: true },
      { script: "base:agent-account-safety-check", passed: false },
      { script: "base:agent-directory-safety-check", passed: true },
    ]);
  });

  it("rejects malformed readiness runner inputs before executing checks", async () => {
    const checks = buildBaseReadinessChecks().slice(0, 1);
    let calls = 0;

    await expect(runBaseReadinessChecks(null as never, async () => {
      calls += 1;
      return { exitCode: 0, signal: null, stdout: "", stderr: "" };
    })).rejects.toThrow("readiness checks must be an array");
    await expect(runBaseReadinessChecks(checks, "runner" as never)).rejects.toThrow(
      "readiness runner must be a function",
    );
    expect(calls).toBe(0);
  });

  it("rejects malformed readiness runner check entries before invoking the runner", async () => {
    let calls = 0;

    await expect(
      runBaseReadinessChecks([{ script: "base:manifest-verify", command: "npm", args: [] } as never], async () => {
        calls += 1;
        return { exitCode: 0, signal: null, stdout: "", stderr: "" };
      }),
    ).rejects.toThrow("readiness check name must be a string");
    expect(calls).toBe(0);
  });

  it("rejects readiness runner checks with malformed commands", async () => {
    const check = { ...buildBaseReadinessChecks()[0]!, command: "pnpm" as never };

    await expect(
      runBaseReadinessChecks([check], async () => ({ exitCode: 0, signal: null, stdout: "", stderr: "" })),
    ).rejects.toThrow("readiness check manifest command must be npm");
  });

  it("rejects readiness runner checks with malformed command args", async () => {
    const check = buildBaseReadinessChecks()[0]!;

    await expect(
      runBaseReadinessChecks([{ ...check, args: "--summary" as never }], async () => ({
        exitCode: 0,
        signal: null,
        stdout: "",
        stderr: "",
      })),
    ).rejects.toThrow("readiness check manifest args must be an array");
    await expect(
      runBaseReadinessChecks([{ ...check, args: ["run", 7, ""] as never }], async () => ({
        exitCode: 0,
        signal: null,
        stdout: "",
        stderr: "",
      })),
    ).rejects.toThrow("readiness check manifest arg 1 must be a string");
  });

  it("rejects malformed readiness runner result objects", async () => {
    const checks = buildBaseReadinessChecks().slice(0, 1);

    await expect(runBaseReadinessChecks(checks, async () => null as never)).rejects.toThrow(
      "readiness result manifest must be an object",
    );
  });

  it("rejects malformed readiness runner result exit codes", async () => {
    const checks = buildBaseReadinessChecks().slice(0, 1);

    await expect(
      runBaseReadinessChecks(checks, async () => ({
        exitCode: "0",
        signal: null,
        stdout: "",
        stderr: "",
      } as never)),
    ).rejects.toThrow("readiness result manifest exitCode must be a number or null");
  });

  it("rejects malformed readiness runner result signals", async () => {
    const checks = buildBaseReadinessChecks().slice(0, 1);

    await expect(
      runBaseReadinessChecks(checks, async () => ({
        exitCode: 0,
        signal: 1,
        stdout: "",
        stderr: "",
      } as never)),
    ).rejects.toThrow("readiness result manifest signal must be a string or null");
  });

  it("rejects malformed readiness runner result output fields", async () => {
    const checks = buildBaseReadinessChecks().slice(0, 1);

    await expect(
      runBaseReadinessChecks(checks, async () => ({
        exitCode: 0,
        signal: null,
        stdout: 12,
        stderr: "",
      } as never)),
    ).rejects.toThrow("readiness result manifest stdout must be a string");
    await expect(
      runBaseReadinessChecks(checks, async () => ({
        exitCode: 0,
        signal: null,
        stdout: "",
        stderr: 12,
      } as never)),
    ).rejects.toThrow("readiness result manifest stderr must be a string");
  });

  it("formats a concise readiness summary", () => {
    const checks = buildBaseReadinessChecks().slice(0, 2);
    const summary = formatBaseReadinessSummary([
      {
        ...checks[0]!,
        exitCode: 0,
        signal: null,
        stdout: "",
        stderr: "",
        passed: true,
      },
      {
        ...checks[1]!,
        exitCode: 1,
        signal: null,
        stdout: "",
        stderr: "boom",
        passed: false,
      },
    ]);

    expect(summary).toBe(
      [
        "Base Sepolia readiness",
        "checks: 2",
        "passed: 1",
        "failed: 1",
        "overall: failed",
        "- manifest: passed",
        "- agent-account: failed",
      ].join("\n"),
    );
  });

  it("formats an empty readiness summary deterministically", () => {
    expect(formatBaseReadinessSummary([])).toBe(
      [
        "Base Sepolia readiness",
        "checks: 0",
        "passed: 0",
        "failed: 0",
        "overall: passed",
      ].join("\n"),
    );
  });

  it("preserves readiness summary result ordering", () => {
    const checks = buildBaseReadinessChecks().slice(0, 3);
    const summary = formatBaseReadinessSummary([
      { ...checks[2]!, exitCode: 0, signal: null, stdout: "", stderr: "", passed: true },
      { ...checks[0]!, exitCode: 1, signal: null, stdout: "", stderr: "", passed: false },
      { ...checks[1]!, exitCode: 0, signal: null, stdout: "", stderr: "", passed: true },
    ]);

    expect(summary.split("\n").slice(-3)).toEqual([
      "- agent-directory: passed",
      "- manifest: failed",
      "- agent-account: passed",
    ]);
  });

  it("rejects malformed readiness summary result lists", () => {
    expect(() => formatBaseReadinessSummary(null as never)).toThrow("readiness summary results must be an array");
    expect(() => formatBaseReadinessSummary("results" as never)).toThrow("readiness summary results must be an array");
  });

  it("rejects malformed readiness summary result entries", () => {
    expect(() => formatBaseReadinessSummary([null as never])).toThrow("readiness summary result must be an object");
  });

  it("rejects malformed readiness summary result names", () => {
    expect(() => formatBaseReadinessSummary([{ passed: true } as never])).toThrow(
      "readiness summary result name must be a string",
    );
    expect(() => formatBaseReadinessSummary([{ name: "  ", passed: true } as never])).toThrow(
      "readiness summary result name must not be empty",
    );
  });

  it("rejects malformed readiness summary pass states", () => {
    expect(() => formatBaseReadinessSummary([{ name: "manifest", passed: "true" } as never])).toThrow(
      "readiness summary result manifest passed must be a boolean",
    );
  });

  it("rejects malformed child-process readiness runner options", () => {
    expect(() => createChildProcessReadinessRunner(null as never)).toThrow(
      "readiness child runner options must be an object",
    );
    expect(() => createChildProcessReadinessRunner({ spawn: "spawn" } as never)).toThrow(
      "readiness child runner spawn must be a function",
    );
    expect(() => createChildProcessReadinessRunner({ environment: "env" } as never)).toThrow(
      "readiness child runner environment must be an object",
    );
  });

  it("forwards readiness checks to the injected child-process spawn boundary", async () => {
    const child = createFakeChildProcess();
    const calls: unknown[] = [];
    const runner = createChildProcessReadinessRunner({
      environment: { BASE_SEPOLIA_RPC_URL: "https://example.invalid" },
      spawn: (command, args, options) => {
        calls.push({ command, args, options });
        queueMicrotask(() => {
          child.stdout!.write("manifest ok");
          child.stderr!.write("manifest warn");
          child.emit("close", 0, null);
        });
        return child;
      },
    });

    const result = await runner(buildBaseReadinessChecks()[0]!);

    expect(calls).toEqual([
      {
        command: "npm",
        args: ["run", "base:manifest-verify", "--", "--summary"],
        options: {
          env: { BASE_SEPOLIA_RPC_URL: "https://example.invalid" },
          stdio: ["ignore", "pipe", "pipe"],
        },
      },
    ]);
    expect(result).toEqual({
      exitCode: 0,
      signal: null,
      stdout: "manifest ok",
      stderr: "manifest warn",
    });
  });

  it("captures multiple child-process stdout and stderr chunks", async () => {
    const child = createFakeChildProcess();
    const runner = createChildProcessReadinessRunner({
      spawn: () => {
        queueMicrotask(() => {
          child.stdout!.write("one");
          child.stdout!.write(Buffer.from(" two"));
          child.stderr!.write("warn");
          child.stderr!.write(Buffer.from(" ing"));
          child.emit("close", 1, "SIGTERM");
        });
        return child;
      },
    });

    await expect(runner(buildBaseReadinessChecks()[0]!)).resolves.toEqual({
      exitCode: 1,
      signal: "SIGTERM",
      stdout: "one two",
      stderr: "warn ing",
    });
  });

  it("handles child-process results without stdout or stderr streams", async () => {
    const child = new EventEmitter() as ReturnType<typeof createFakeChildProcess>;
    child.stdout = null;
    child.stderr = null;
    const runner = createChildProcessReadinessRunner({
      spawn: () => {
        queueMicrotask(() => child.emit("close", 0, null));
        return child;
      },
    });

    await expect(runner(buildBaseReadinessChecks()[0]!)).resolves.toEqual({
      exitCode: 0,
      signal: null,
      stdout: "",
      stderr: "",
    });
  });

  it("resolves child-process spawn errors as failed readiness results", async () => {
    const child = createFakeChildProcess();
    const runner = createChildProcessReadinessRunner({
      spawn: () => {
        queueMicrotask(() => child.emit("error", new Error("spawn failed")));
        return child;
      },
    });

    await expect(runner(buildBaseReadinessChecks()[0]!)).resolves.toEqual({
      exitCode: 1,
      signal: null,
      stdout: "",
      stderr: "spawn failed",
    });
  });

  it("rejects malformed package script maps for readiness package coverage", () => {
    const failures = validateBaseReadinessPackageScripts({
      packageJson: { scripts: "not-an-object" },
    });

    expect(failures).toEqual(["package.json scripts must be an object"]);
  });

  it("rejects readiness checks that reference missing package scripts", () => {
    const failures = validateBaseReadinessPackageScripts({
      packageJson: { scripts: { "base:manifest-verify": "tsx runtime/cli/base/manifestVerify.ts" } },
      readinessScripts: [
        { name: "manifest", script: "base:manifest-verify" },
        { name: "payment", script: "base:safety-check" },
      ],
    });

    expect(failures).toEqual([
      "readiness script payment references missing package script base:safety-check",
    ]);
  });

  it("rejects readiness scripts outside the Base package namespace even when the package script exists", () => {
    const failures = validateBaseReadinessPackageScripts({
      packageJson: { scripts: { test: "vitest run" } },
      readinessScripts: [
        { name: "test", script: "test" },
      ],
    });

    expect(failures).toEqual([
      "readiness script test must use a base:* package script name",
    ]);
  });

  it("rejects malformed readiness script entries before package coverage checks", () => {
    const failures = validateBaseReadinessPackageScripts({
      packageJson: { scripts: {} },
      readinessScripts: [
        { script: "base:manifest-verify" },
        { name: "manifest", script: 7 },
      ],
    });

    expect(failures).toEqual([
      "readiness script name must be a string",
      "readiness script manifest script must be a string",
    ]);
  });

  it("rejects malformed readiness script lists before iterating entries", () => {
    const failures = validateBaseReadinessPackageScripts({
      packageJson: { scripts: {} },
      readinessScripts: "base:manifest-verify" as never,
    });

    expect(failures).toEqual(["readiness scripts must be an array"]);
  });

  it("rejects empty readiness names and package script names", () => {
    const failures = validateBaseReadinessPackageScripts({
      packageJson: { scripts: {} },
      readinessScripts: [
        { name: "", script: "base:manifest-verify" },
        { name: "payment", script: "   " },
      ],
    });

    expect(failures).toEqual([
      "readiness script name must not be empty",
      "readiness script payment script must not be empty",
    ]);
  });

  it("rejects malformed readiness args before package coverage checks", () => {
    const failures = validateBaseReadinessPackageScripts({
      packageJson: { scripts: {} },
      readinessScripts: [
        { name: "manifest", script: "base:manifest-verify", args: "--summary" },
        { name: "payment", script: "base:safety-check", args: ["--manifest", 12, "  "] },
      ],
    });

    expect(failures).toEqual([
      "readiness script manifest args must be an array",
      "readiness script payment arg 1 must be a string",
      "readiness script payment arg 2 must not be empty",
    ]);
  });

  it("rejects malformed referenced package script values", () => {
    const failures = validateBaseReadinessPackageScripts({
      packageJson: {
        scripts: {
          "base:manifest-verify": 7,
          "base:safety-check": "   ",
        },
      },
      readinessScripts: [
        { name: "manifest", script: "base:manifest-verify" },
        { name: "payment", script: "base:safety-check" },
      ],
    });

    expect(failures).toEqual([
      "readiness package script base:manifest-verify value must be a string",
      "readiness package script base:safety-check value must not be empty",
    ]);
  });

  it("aggregates independent malformed readiness and package script failures", () => {
    const failures = validateBaseReadinessPackageScripts({
      packageJson: {
        scripts: {
          "base:manifest-verify": "",
        },
      },
      readinessScripts: [
        { name: " ", script: "base:manifest-verify" },
        { name: "manifest", script: "base:manifest-verify", args: [undefined] },
        { name: "payment", script: "base:safety-check" },
      ],
    });

    expect(failures).toEqual([
      "readiness script name must not be empty",
      "readiness script manifest arg 0 must be a string",
      "readiness package script base:manifest-verify value must not be empty",
      "readiness script payment references missing package script base:safety-check",
    ]);
  });

  it("rejects duplicate readiness names", () => {
    const failures = validateBaseReadinessPackageScripts({
      packageJson: {
        scripts: {
          "base:manifest-verify": "tsx runtime/cli/base/manifestVerify.ts",
          "base:safety-check": "tsx runtime/cli/payments/safetyCheck.ts",
        },
      },
      readinessScripts: [
        { name: "manifest", script: "base:manifest-verify" },
        { name: "manifest", script: "base:safety-check" },
      ],
    });

    expect(failures).toEqual([
      "readiness script name manifest must be unique, already used by base:manifest-verify",
    ]);
  });

  it("rejects duplicate readiness package script references", () => {
    const failures = validateBaseReadinessPackageScripts({
      packageJson: { scripts: { "base:manifest-verify": "tsx runtime/cli/base/manifestVerify.ts" } },
      readinessScripts: [
        { name: "manifest", script: "base:manifest-verify" },
        { name: "manifest-copy", script: "base:manifest-verify" },
      ],
    });

    expect(failures).toEqual([
      "readiness package script base:manifest-verify must be unique, already used by manifest",
    ]);
  });

  it("keeps live readiness checks aligned with package scripts", () => {
    const failures = validateBaseReadinessPackageScripts({
      packageJson: readPackageJson(),
    });

    expect(failures).toEqual([]);
  });
});

function createFakeChildProcess(): EventEmitter & {
  stdout: PassThrough | null;
  stderr: PassThrough | null;
} {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough | null;
    stderr: PassThrough | null;
  };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  return child;
}
