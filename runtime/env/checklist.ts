export type BaseSepoliaEnvChecklistScope = "release" | "readiness" | "broadcast" | "all";

export interface BaseSepoliaEnvChecklistParams {
  scope: BaseSepoliaEnvChecklistScope;
  env: Record<string, string | undefined>;
}

export interface BaseSepoliaEnvChecklistVariable {
  name: string;
  required: boolean;
  configured: boolean;
  secret: boolean;
  reason: string;
  displayValue?: string | undefined;
}

export interface BaseSepoliaEnvChecklistReport {
  scope: BaseSepoliaEnvChecklistScope;
  passed: boolean;
  missing: string[];
  variables: BaseSepoliaEnvChecklistVariable[];
  notes: string[];
}

interface EnvRequirement {
  name: string;
  secret: boolean;
  reason: string;
  validate?: ((value: string) => boolean) | undefined;
}

const RELEASE_NOTE = "Base Sepolia release evidence commands read local files only.";

const READINESS_REQUIREMENTS: EnvRequirement[] = [
  {
    name: "BASE_SEPOLIA_RPC_URL",
    secret: true,
    reason: "Required for read-only Base Sepolia manifest and readiness checks.",
  },
];

const BROADCAST_REQUIREMENTS: EnvRequirement[] = [
  ...READINESS_REQUIREMENTS,
  {
    name: "BASE_SEPOLIA_CHAIN_ID",
    secret: false,
    reason: "Must be 84532 for Base Sepolia broadcasts.",
    validate: (value) => value === "84532",
  },
  {
    name: "PRIVATE_KEY",
    secret: true,
    reason: "Required only when broadcasting transactions.",
  },
];

export function createBaseSepoliaEnvChecklist(params: BaseSepoliaEnvChecklistParams): BaseSepoliaEnvChecklistReport {
  const requirements = requirementsForScope(params.scope);
  const variables = requirements.map((requirement) => evaluateRequirement(requirement, params.env));
  const missing = variables.filter((variable) => !variable.configured).map((variable) => variable.name);
  const notes = params.scope === "release" || params.scope === "all" ? [RELEASE_NOTE] : [];

  return {
    scope: params.scope,
    passed: missing.length === 0,
    missing,
    variables,
    notes,
  };
}

function requirementsForScope(scope: BaseSepoliaEnvChecklistScope): EnvRequirement[] {
  if (scope === "release") return [];
  if (scope === "readiness") return READINESS_REQUIREMENTS;
  if (scope === "broadcast") return BROADCAST_REQUIREMENTS;
  return dedupeRequirements([...READINESS_REQUIREMENTS, ...BROADCAST_REQUIREMENTS]);
}

function dedupeRequirements(requirements: EnvRequirement[]): EnvRequirement[] {
  const byName = new Map<string, EnvRequirement>();
  for (const requirement of requirements) byName.set(requirement.name, requirement);
  return [...byName.values()];
}

function evaluateRequirement(
  requirement: EnvRequirement,
  env: Record<string, string | undefined>,
): BaseSepoliaEnvChecklistVariable {
  const rawValue = env[requirement.name];
  const hasUsableValue = isUsableEnvValue(rawValue);
  const configured = hasUsableValue && (requirement.validate === undefined || requirement.validate(rawValue!.trim()));

  return {
    name: requirement.name,
    required: true,
    configured,
    secret: requirement.secret,
    reason: requirement.reason,
    ...(rawValue === undefined || rawValue.length === 0
      ? {}
      : { displayValue: requirement.secret ? "[redacted]" : rawValue.trim() }),
  };
}

function isUsableEnvValue(value: string | undefined): value is string {
  if (value === undefined) return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  const lower = trimmed.toLowerCase();
  if (lower.includes("replace_with")) return false;
  if (lower.startsWith("<") && lower.endsWith(">")) return false;
  return true;
}
