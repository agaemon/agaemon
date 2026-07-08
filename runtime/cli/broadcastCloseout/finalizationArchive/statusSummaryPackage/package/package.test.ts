import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Module = typeof import("./package.js") & {
  isBroadcastCloseoutFinalizationArchiveStatusSummaryPackageDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastCloseoutFinalizationArchiveStatusSummaryPackageCliArgs?: (argv: readonly string[]) => Record<string, string>;
  runBroadcastCloseoutFinalizationArchiveStatusSummaryPackageCli?: (options?: RunnerOptions) => Promise<void>;
};

interface RunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createPackage?: (params: unknown) => PackageManifest;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface PackageManifest {
  generatedAt: string;
  finalizationArchiveStatusSummary: { path: string };
  finalizationArchiveStatus: { path: string };
  finalizationArchive: { path: string };
  report: { path: string };
  archive: { path: string };
  status: { path: string };
  summary: { path: string };
  finalizationStatus: { path: string };
  verification: { passed: boolean; failures: readonly string[] };
}

const ARGS = [
  "--finalization-archive-status-summary", "artifacts/finalization-archive-status-summary.md",
  "--finalization-archive-status", "artifacts/finalization-archive-status.json",
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

const PACKAGE: PackageManifest = {
  generatedAt: "2026-07-01T09:30:00.000Z",
  finalizationArchiveStatusSummary: { path: "artifacts/finalization-archive-status-summary.md" },
  finalizationArchiveStatus: { path: "artifacts/finalization-archive-status.json" },
  finalizationArchive: { path: "artifacts/finalization-archive.json" },
  report: { path: "artifacts/report.md" },
  archive: { path: "artifacts/archive.json" },
  status: { path: "artifacts/status.json" },
  summary: { path: "artifacts/summary.md" },
  finalizationStatus: { path: "artifacts/finalization-status.json" },
  verification: { passed: true, failures: [] },
};

describe("finalization archive status summary package CLI seams", () => {
  it("detects direct execution and parses strict args", async () => {
    const module = await import("./package.js") as Module;
    const scriptPath = resolve("runtime/cli/broadcastCloseout/finalizationArchive/statusSummaryPackage/package/package.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastCloseoutFinalizationArchiveStatusSummaryPackageDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.parseBroadcastCloseoutFinalizationArchiveStatusSummaryPackageCliArgs?.([
      ...ARGS,
      "--output=artifacts/finalization-archive-status-summary-package.json",
      "--generated-at=2026-07-01T09:30:00.000Z",
    ])).toMatchObject({
      generatedAt: "2026-07-01T09:30:00.000Z",
      outputPath: "artifacts/finalization-archive-status-summary-package.json",
    });
    expect(() => module.parseBroadcastCloseoutFinalizationArchiveStatusSummaryPackageCliArgs?.([])).toThrow(
      "--finalization-archive-status-summary is required",
    );
    expect(() => module.parseBroadcastCloseoutFinalizationArchiveStatusSummaryPackageCliArgs?.(["--output"])).toThrow(
      "--output requires a value",
    );
    expect(() => module.parseBroadcastCloseoutFinalizationArchiveStatusSummaryPackageCliArgs?.([
      ...ARGS,
      "--archive", "artifacts/other-archive.json",
    ])).toThrow("Duplicate argument: --archive");
  });

  it("writes package summaries through injected dependencies", async () => {
    const module = await import("./package.js") as Module;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutFinalizationArchiveStatusSummaryPackageCli?.({
      argv: [...ARGS, "--output", "artifacts/finalization-archive-status-summary-package.json"],
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      createPackage: () => PACKAGE,
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({
      output: "artifacts/finalization-archive-status-summary-package.json",
      passed: true,
    });
    expect(calls.some((call) => call.startsWith("write:artifacts/finalization-archive-status-summary-package.json:"))).toBe(true);
  });

  it("rejects malformed arguments before reads", async () => {
    const module = await import("./package.js") as Module;
    const calls: string[] = [];

    await expect(module.runBroadcastCloseoutFinalizationArchiveStatusSummaryPackageCli?.({
      argv: ["--unknown"],
      readText: async () => {
        calls.push("read");
        return "";
      },
      createPackage: () => PACKAGE,
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
