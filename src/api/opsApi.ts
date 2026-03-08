import { getAuthHeaders, getGatewayUrl } from "@/api/auth";

const GATEWAY_URL = getGatewayUrl();
const DEFAULT_REMOTE_HOST = import.meta.env.VITE_DEFAULT_OPS_HOSTKEY || "";

export type OpsAction = "start-horizon" | "restart-horizon" | "reconnect-gateway" | "open-logs";

const HIGH_RISK_ACTIONS: OpsAction[] = ["start-horizon", "restart-horizon"];

export function isHighRiskAction(action: string): action is OpsAction {
  return HIGH_RISK_ACTIONS.includes(action as OpsAction);
}

async function readJsonSafe(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function runLocalOpsAction(action: OpsAction, approved = false) {
  const response = await fetch(`${GATEWAY_URL}/api/ops/local`, {
    method: "POST",
    headers: getAuthHeaders({
      "Content-Type": "application/json",
      "x-ops-approved": approved ? "true" : "false",
    }),
    body: JSON.stringify({ action }),
  });

  const payload = await readJsonSafe(response);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || payload?.code || `HTTP ${response.status}`);
  }

  return payload as { ok: true; requestId: string; action: string; exitCode: number | null };
}

export async function runRemoteOpsAction(hostKey: string, action: OpsAction, approved = false) {
  const response = await fetch(`${GATEWAY_URL}/api/ops/remote`, {
    method: "POST",
    headers: getAuthHeaders({
      "Content-Type": "application/json",
      "x-ops-approved": approved ? "true" : "false",
    }),
    body: JSON.stringify({ hostKey, action }),
  });

  const payload = await readJsonSafe(response);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || payload?.code || `HTTP ${response.status}`);
  }

  return payload as { ok: true; requestId: string; action: string; exitCode: number | null };
}

export interface ParsedOpsCommand {
  mode: "local" | "remote";
  hostKey?: string;
  action: OpsAction;
}

const ALLOWED_ACTION_SET = new Set<OpsAction>([
  "start-horizon",
  "restart-horizon",
  "reconnect-gateway",
  "open-logs",
]);

export function parseOpsCommand(text: string): ParsedOpsCommand | null {
  const trimmed = text.trim();
  const parts = trimmed.split(/\s+/);

  if (parts[0] === "ops.local" && parts.length === 2) {
    const action = parts[1] as OpsAction;
    if (!ALLOWED_ACTION_SET.has(action)) return null;
    return { mode: "local", action };
  }

  if (parts[0] === "ops.remote" && parts.length === 3) {
    const hostKey = parts[1];
    const action = parts[2] as OpsAction;
    if (!hostKey || !ALLOWED_ACTION_SET.has(action)) return null;
    return { mode: "remote", hostKey, action };
  }

  if (parts[0] === "ops.remote" && parts.length === 2 && DEFAULT_REMOTE_HOST) {
    const action = parts[1] as OpsAction;
    if (!ALLOWED_ACTION_SET.has(action)) return null;
    return { mode: "remote", hostKey: DEFAULT_REMOTE_HOST, action };
  }

  return null;
}

export async function runOpsCommand(cmd: ParsedOpsCommand) {
  const approved = isHighRiskAction(cmd.action)
    ? window.confirm(`Approve high-risk action: ${cmd.action}?`)
    : true;

  if (!approved) {
    throw new Error("Action canceled");
  }

  if (cmd.mode === "local") {
    return runLocalOpsAction(cmd.action, true);
  }

  return runRemoteOpsAction(cmd.hostKey || DEFAULT_REMOTE_HOST, cmd.action, true);
}

export function getDefaultOpsHostKey() {
  return DEFAULT_REMOTE_HOST;
}
