import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createOperatorDashboardServer,
} from "../../operator/server.js";
import { validateOperatorDashboardSnapshot } from "../../operator/dashboard.js";

import type { Server } from "node:http";
import type { OperatorDashboardSnapshot } from "../../operator/dashboard.js";

const DEFAULT_DASHBOARD_PATH = "artifacts/operator-dashboard.json";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8787;

export interface OperatorDashboardServeCliArgs {
  dashboardPath: string;
  host: string;
  port: number;
}

export interface OperatorDashboardServeCliOptions {
  argv?: readonly string[] | undefined;
  env?: Record<string, string | undefined> | undefined;
  readText?: (path: string) => Promise<string>;
  writeOutput?: (output: string) => void;
  listen?: (server: Server, port: number, host: string) => Promise<void> | void;
}

if (isOperatorDashboardServeDirectRun(import.meta.url, process.argv)) await runOperatorDashboardServeCli();

export async function runOperatorDashboardServeCli(
  options: OperatorDashboardServeCliOptions = {},
): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const listen = options.listen ?? listenOnServer;

  validateStringArray(argv, "CLI argv must be an array of strings");
  validateOutputWriter(writeOutput);
  const args = parseOperatorDashboardServeCliArgs(argv);
  const snapshot = JSON.parse(await readText(args.dashboardPath)) as OperatorDashboardSnapshot;
  validateOperatorDashboardSnapshot(snapshot);
  const server = createOperatorDashboardServer({
    snapshot,
    dashboardPath: args.dashboardPath,
  });

  await listen(server, args.port, args.host);
  writeOutput(formatOperatorDashboardServeCliOutput(args));
}

export function parseOperatorDashboardServeCliArgs(argv: readonly string[]): OperatorDashboardServeCliArgs {
  validateStringArray(argv, "CLI argv must be an array of strings");
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (isValueFlag(arg)) {
      setOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }
    const equals = arg.match(/^(--dashboard|--host|--port)=(.*)$/u);
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    dashboardPath: values.get("--dashboard") ?? DEFAULT_DASHBOARD_PATH,
    host: readHost(values.get("--host") ?? DEFAULT_HOST),
    port: readPort(values.get("--port") ?? String(DEFAULT_PORT)),
  };
}

export function formatOperatorDashboardServeCliOutput(args: OperatorDashboardServeCliArgs): string {
  validateServeArgs(args);
  const origin = `http://${args.host}:${args.port}`;
  return [
    "Operator dashboard server",
    `dashboard: ${args.dashboardPath}`,
    `url: ${origin}/`,
    `api: ${origin}/api/dashboard`,
    `health: ${origin}/healthz`,
    "trustBoundary: AI proposes. Policy decides. Accounts execute.",
    "callClass: local-only read-only",
  ].join("\n");
}

export function isOperatorDashboardServeDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateStringArray(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function listenOnServer(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
}

function isValueFlag(arg: string): boolean {
  return arg === "--dashboard" || arg === "--host" || arg === "--port";
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function readHost(value: string): string {
  if (value.trim().length === 0) throw new Error("--host must be a non-empty string");
  return value;
}

function readPort(value: string): number {
  if (!/^\d+$/u.test(value)) throw new Error("--port must be an integer from 0 to 65535");
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("--port must be an integer from 0 to 65535");
  }
  return port;
}

function validateServeArgs(args: unknown): asserts args is OperatorDashboardServeCliArgs {
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    throw new Error("Operator dashboard serve args must be an object");
  }
  const record = args as Record<string, unknown>;
  if (typeof record.dashboardPath !== "string" || record.dashboardPath.length === 0) {
    throw new Error("dashboard path must be a non-empty string");
  }
  if (typeof record.host !== "string" || record.host.length === 0) {
    throw new Error("host must be a non-empty string");
  }
  const port = record.port;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("port must be an integer from 0 to 65535");
  }
}

function validateOptions(options: unknown): asserts options is OperatorDashboardServeCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Operator dashboard serve options must be an object");
  }
}

function validateStringArray(value: unknown, message: string): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error(message);
}

function validateOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}
