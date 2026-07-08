import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BASE_PACKAGE_CLI_WRAPPER_EXCLUDED_SUFFIXES,
  BASE_PACKAGE_SCRIPT_NAMESPACE,
  BASE_RUNTIME_CLI_ROOT,
  BASE_RUNTIME_CLI_TARGET_PREFIX,
  collectRuntimeCliFiles,
  validatePackageCliScriptCoverage,
} from "./packageScripts.js";

const PACKAGE_JSON_PATH = "package.json";
const CLI_ROOT = BASE_RUNTIME_CLI_ROOT;

function readPackageJson(): unknown {
  return JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8"));
}

function readCliFiles(dir = CLI_ROOT): string[] {
  return readdirSync(dir, { recursive: true })
    .map((entry) => join(dir, String(entry)))
    .filter((path) => path.endsWith(".ts"))
    .sort();
}

describe("validatePackageCliScriptCoverage", () => {
  it("exposes package script coverage constants used by live repository tests", () => {
    expect(BASE_PACKAGE_SCRIPT_NAMESPACE).toBe("base:");
    expect(BASE_RUNTIME_CLI_ROOT).toBe("runtime/cli");
    expect(BASE_RUNTIME_CLI_TARGET_PREFIX).toBe("runtime/cli/");
    expect(BASE_PACKAGE_CLI_WRAPPER_EXCLUDED_SUFFIXES).toEqual([".test.ts", "/runnerShared.ts"]);
  });

  it("rejects malformed package script maps", () => {
    const failures = validatePackageCliScriptCoverage({
      packageJson: { scripts: "not-an-object" },
      cliFiles: ["runtime/cli/base/execute.ts"],
      fileExists: () => true,
    });

    expect(failures).toEqual(["package.json scripts must be an object"]);
  });

  it("rejects missing runtime CLI script targets", () => {
    const failures = validatePackageCliScriptCoverage({
      packageJson: { scripts: { "base:missing": "tsx runtime/cli/base/missing.ts" } },
      cliFiles: [],
      fileExists: () => false,
    });

    expect(failures).toEqual([
      "package script base:missing target runtime/cli/base/missing.ts must exist",
    ]);
  });

  it("rejects runtime CLI script targets outside the base namespace", () => {
    const failures = validatePackageCliScriptCoverage({
      packageJson: { scripts: { "cli:execute": "tsx runtime/cli/base/execute.ts" } },
      cliFiles: ["runtime/cli/base/execute.ts"],
      fileExists: () => true,
    });

    expect(failures).toEqual([
      "package script cli:execute target runtime/cli/base/execute.ts must use a base:* script name",
    ]);
  });

  it("rejects base scripts that do not target scoped runtime CLI TypeScript wrappers", () => {
    const failures = validatePackageCliScriptCoverage({
      packageJson: {
        scripts: {
          "base:node": "node runtime/cli/base/execute.ts",
          "base:outside": "tsx runtime/base/execute.ts",
          "base:flat": "tsx runtime/cli/execute.ts",
          "base:js": "tsx runtime/cli/base/execute.js",
        },
      },
      cliFiles: [],
      fileExists: () => true,
    });

    expect(failures).toEqual([
      "package script base:node command must invoke tsx runtime/cli/**/*.ts",
      "package script base:outside command must invoke tsx runtime/cli/**/*.ts",
      "package script base:flat target runtime/cli/execute.ts must be a scoped runtime/cli TypeScript file",
      "package script base:js target runtime/cli/base/execute.js must be a scoped runtime/cli TypeScript file",
    ]);
  });

  it("rejects malformed base script command values", () => {
    const failures = validatePackageCliScriptCoverage({
      packageJson: {
        scripts: {
          "base:empty": "",
          "base:non-string": 7,
        },
      },
      cliFiles: [],
      fileExists: () => true,
    });

    expect(failures).toEqual([
      "package script base:empty command must invoke tsx runtime/cli/**/*.ts",
      "package script base:non-string command must be a string",
    ]);
  });

  it("ignores non-base scripts targeting runtime path near-misses outside runtime CLI coverage", () => {
    const failures = validatePackageCliScriptCoverage({
      packageJson: { scripts: { "dev:client": "tsx runtime/client.ts" } },
      cliFiles: [],
      fileExists: () => true,
    });

    expect(failures).toEqual([]);
  });

  it("rejects base scripts targeting runtime path near-misses outside runtime CLI coverage", () => {
    const failures = validatePackageCliScriptCoverage({
      packageJson: { scripts: { "base:client": "tsx runtime/client.ts" } },
      cliFiles: [],
      fileExists: () => true,
    });

    expect(failures).toEqual([
      "package script base:client command must invoke tsx runtime/cli/**/*.ts",
    ]);
  });

  it("rejects operator CLI wrappers without package scripts", () => {
    const failures = validatePackageCliScriptCoverage({
      packageJson: { scripts: { "base:execute": "tsx runtime/cli/base/execute.ts" } },
      cliFiles: [
        "runtime/cli/base/execute.ts",
        "runtime/cli/base/readiness.ts",
        "runtime/cli/base/readiness.test.ts",
        "runtime/cli/base/runnerShared.ts",
      ],
      fileExists: () => true,
    });

    expect(failures).toEqual([
      "runtime CLI wrapper runtime/cli/base/readiness.ts must have a package script",
    ]);
  });

  it("excludes CLI tests and shared runner helpers from script coverage", () => {
    const failures = validatePackageCliScriptCoverage({
      packageJson: { scripts: { "base:execute": "tsx runtime/cli/base/execute.ts" } },
      cliFiles: [
        "runtime/cli/base/execute.ts",
        "runtime/cli/base/execute.test.ts",
        "runtime/cli/base/runnerShared.ts",
      ],
      fileExists: () => true,
    });

    expect(failures).toEqual([]);
  });

  it("rejects duplicate script targets", () => {
    const failures = validatePackageCliScriptCoverage({
      packageJson: {
        scripts: {
          "base:execute": "tsx runtime/cli/base/execute.ts",
          "base:execute-alias": "tsx runtime/cli/base/execute.ts",
        },
      },
      cliFiles: ["runtime/cli/base/execute.ts"],
      fileExists: () => true,
    });

    expect(failures).toEqual([
      "runtime CLI target runtime/cli/base/execute.ts must have one package script, found base:execute, base:execute-alias",
    ]);
  });

  it("rejects unscoped or non-TypeScript runtime CLI targets", () => {
    const failures = validatePackageCliScriptCoverage({
      packageJson: {
        scripts: {
          "base:legacy": "tsx runtime/cli/baseExecute.ts",
          "base:js": "tsx runtime/cli/base/execute.js",
        },
      },
      cliFiles: [],
      fileExists: () => true,
    });

    expect(failures).toEqual([
      "package script base:legacy target runtime/cli/baseExecute.ts must be a scoped runtime/cli TypeScript file",
      "package script base:js target runtime/cli/base/execute.js must be a scoped runtime/cli TypeScript file",
    ]);
  });
});

describe("package CLI script live repository coverage", () => {
  it("keeps package scripts aligned with runtime CLI wrappers", () => {
    const failures = validatePackageCliScriptCoverage({
      packageJson: readPackageJson(),
      cliFiles: collectRuntimeCliFiles(readCliFiles()),
      fileExists: (path) => readCliFiles().includes(path),
    });

    expect(failures).toEqual([]);
  });
});
