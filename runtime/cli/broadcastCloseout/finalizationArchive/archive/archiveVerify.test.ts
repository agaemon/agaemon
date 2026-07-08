import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Module = typeof import("./archiveVerify.js") & {
  isBroadcastCloseoutFinalizationArchiveVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastCloseoutFinalizationArchiveVerifyCliArgs?: (argv: readonly string[]) => Record<string, string>;
  runBroadcastCloseoutFinalizationArchiveVerifyCli?: (options?: RunnerOptions) => Promise<void>;
};

interface RunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyArchive?: (params: unknown) => { passed: boolean; failures: readonly string[] };
}

const ARGS = [
  "--finalization-archive", "artifacts/finalization-archive.json",
  "--report", "artifacts/report.md",
  "--archive", "artifacts/archive.json",
  "--status", "artifacts/status.json",
  "--summary", "artifacts/summary.md",
  "--finalization-status", "artifacts/finalization-status.json",
  "--broadcast-receipt", "artifacts/receipt.json",
  "--broadcast-package", "artifacts/package.json",
  "--submit-result", "artifacts/submit.json",
] as const;

describe("finalization archive verify CLI seams", () => {
  it("detects direct execution and parses strict args", async () => {
    const module = await import("./archiveVerify.js") as Module;
    const scriptPath = resolve("runtime/cli/broadcastCloseout/finalizationArchive/archive/archiveVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastCloseoutFinalizationArchiveVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.parseBroadcastCloseoutFinalizationArchiveVerifyCliArgs?.(ARGS)).toMatchObject({
      finalizationArchivePath: "artifacts/finalization-archive.json",
      finalizationStatusPath: "artifacts/finalization-status.json",
    });
    expect(module.parseBroadcastCloseoutFinalizationArchiveVerifyCliArgs?.(
      ARGS.map((arg, index) => (index % 2 === 0 ? `${arg}=${ARGS[index + 1]}` : null)).filter((arg) => arg !== null),
    )).toMatchObject({
      broadcastReceiptPath: "artifacts/receipt.json",
      submitResultPath: "artifacts/submit.json",
    });
    expect(() => module.parseBroadcastCloseoutFinalizationArchiveVerifyCliArgs?.([])).toThrow(
      "--finalization-archive is required",
    );
    expect(() => module.parseBroadcastCloseoutFinalizationArchiveVerifyCliArgs?.([
      ...ARGS,
      "--archive", "artifacts/other-archive.json",
    ])).toThrow("Duplicate argument: --archive");
  });

  it("runs through injected dependencies and sets failed exit after output", async () => {
    const module = await import("./archiveVerify.js") as Module;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutFinalizationArchiveVerifyCli?.({
      argv: ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      verifyArchive: () => ({ passed: false, failures: ["archive mismatch"] }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ passed: false, failures: ["archive mismatch"] });
    expect(exitCodes).toEqual([1]);
    expect(calls).toContain("read:artifacts/finalization-archive.json");
  });

  it("rejects malformed arguments before reads", async () => {
    const module = await import("./archiveVerify.js") as Module;
    const calls: string[] = [];

    await expect(module.runBroadcastCloseoutFinalizationArchiveVerifyCli?.({
      argv: ["--unknown"],
      readText: async () => {
        calls.push("read");
        return "";
      },
      verifyArchive: () => ({ passed: true, failures: [] }),
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
