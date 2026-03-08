import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";

const DEFAULT_LOCAL_ACTIONS = {
  "start-horizon": "start-horizon.ps1",
  "restart-horizon": "restart-horizon.ps1",
  "reconnect-gateway": "reconnect-gateway.ps1",
  "open-logs": "open-logs.ps1",
};

const DEFAULTS = {
  scriptsRoot: "C:\\NxtLvl\\ops",
  receiptRoot: path.resolve(process.cwd(), "horizon/runtime/ops/receipts"),
  logFile: path.resolve(process.cwd(), "horizon/runtime/logs/ops-controller.log"),
  timeoutMs: 30_000,
  maxRemoteBodyBytes: 10 * 1024,
  localActions: DEFAULT_LOCAL_ACTIONS,
  approval: {
    enabled: false,
    highRiskActions: ["start-horizon", "restart-horizon"],
  },
};

function nowIso() {
  return new Date().toISOString();
}

function hmacHex(secret, payload) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

async function appendLog(logFile, line) {
  await fs.mkdir(path.dirname(logFile), { recursive: true });
  await fs.appendFile(logFile, `${line}\n`, "utf8");
}

async function writeReceipt(receiptRoot, receipt) {
  const date = receipt.finishedAt.slice(0, 10);
  const dir = path.join(receiptRoot, date);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${receipt.requestId}.json`);
  await fs.writeFile(filePath, JSON.stringify(receipt, null, 2), "utf8");
}

function sanitizeScriptName(fileName) {
  const normalized = String(fileName || "").trim();
  if (!/^[a-zA-Z0-9._-]+\.ps1$/.test(normalized)) return null;
  if (normalized.includes("..") || normalized.includes("/") || normalized.includes("\\")) return null;
  return normalized;
}

function resolveActionScript(scriptsRoot, localActions, action) {
  const scriptName = sanitizeScriptName(localActions?.[action]);
  if (!scriptName) return null;
  return path.join(scriptsRoot, scriptName);
}

function isApproved(approvalConfig, action, approvedHeader) {
  if (!approvalConfig?.enabled) return true;
  const highRiskActions = approvalConfig.highRiskActions || [];
  if (!highRiskActions.includes(action)) return true;
  return String(approvedHeader || "").toLowerCase() === "true";
}

function executeLocalAction(scriptPath) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(
      "powershell.exe",
      ["-ExecutionPolicy", "Bypass", "-File", scriptPath],
      { windowsHide: true, stdio: "ignore" },
    );

    child.on("error", (error) => {
      resolve({ ok: false, exitCode: null, durationMs: Date.now() - started, errorSummary: error?.message || "Failed to start script" });
    });

    child.on("close", (exitCode) => {
      resolve({ ok: exitCode === 0, exitCode: typeof exitCode === "number" ? exitCode : null, durationMs: Date.now() - started, errorSummary: null });
    });
  });
}

export function signOpsRequest(secret, timestampMs, rawBody) {
  return hmacHex(secret, `${timestampMs}.${rawBody}`);
}

export async function callRemoteRunner({ baseUrl, secret, action, requestId, timeoutMs = 30_000 }) {
  const body = JSON.stringify({ action, requestId });
  if (Buffer.byteLength(body, "utf8") > 10 * 1024) {
    throw new Error("Body too large");
  }

  const timestamp = Date.now();
  const signature = signOpsRequest(secret, timestamp, body);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ops-timestamp": String(timestamp),
        "x-ops-signature": signature,
      },
      body,
      signal: controller.signal,
    });

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { ok: false, error: "Bad upstream response", code: "UPSTREAM_BAD_JSON" };
    }

    if (!res.ok || !json?.ok) {
      return {
        ok: false,
        status: res.status,
        error: json?.error || "Remote action failed",
        code: json?.code || "REMOTE_ERROR",
        requestId,
        action,
        exitCode: json?.exitCode ?? null,
      };
    }

    return {
      ok: true,
      status: res.status,
      requestId,
      action,
      exitCode: json?.exitCode ?? 0,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function createOpsController(options = {}) {
  const config = {
    ...DEFAULTS,
    ...options,
    approval: { ...DEFAULTS.approval, ...(options.approval || {}) },
    localActions: { ...DEFAULTS.localActions, ...(options.localActions || {}) },
    opsHosts: options.opsHosts || {},
  };

  async function finalizeReceipt(baseReceipt, result) {
    const finishedAt = nowIso();
    const receipt = {
      ...baseReceipt,
      finishedAt,
      status: result.ok ? "success" : "failed",
      exitCode: result.exitCode ?? null,
      durationMs: result.durationMs ?? (Date.now() - new Date(baseReceipt.startedAt).getTime()),
      errorSummary: result.ok ? null : result.error || result.errorSummary || "Action failed",
    };

    await writeReceipt(config.receiptRoot, receipt).catch(() => undefined);
    await appendLog(
      config.logFile,
      `[${finishedAt}] [${receipt.requestId}] origin=${receipt.origin} host=${receipt.targetHost} action=${receipt.action} status=${receipt.status} exitCode=${receipt.exitCode ?? "null"}`,
    ).catch(() => undefined);

    return receipt;
  }

  async function runLocal({ action, requestId, origin }) {
    const startedAt = nowIso();
    const scriptPath = resolveActionScript(config.scriptsRoot, config.localActions, action);

    const baseReceipt = {
      requestId,
      action,
      machine: os.hostname(),
      origin,
      targetHost: "local",
      startedAt,
    };

    if (!scriptPath) {
      const receipt = await finalizeReceipt(baseReceipt, {
        ok: false,
        error: "Action not allowed",
        code: "ACTION_NOT_ALLOWED",
        exitCode: null,
      });
      return { ok: false, statusCode: 400, receipt, code: "ACTION_NOT_ALLOWED" };
    }

    const result = await executeLocalAction(scriptPath);
    const receipt = await finalizeReceipt(baseReceipt, result);

    if (!result.ok) {
      return { ok: false, statusCode: 500, receipt, code: "ACTION_FAILED" };
    }

    return { ok: true, statusCode: 200, receipt, code: "OK" };
  }

  async function runRemote({ hostKey, action, requestId, origin }) {
    const host = config.opsHosts[hostKey];
    const startedAt = nowIso();

    const baseReceipt = {
      requestId,
      action,
      machine: os.hostname(),
      origin,
      targetHost: hostKey,
      startedAt,
    };

    if (!host?.baseUrl || !host?.secret) {
      const receipt = await finalizeReceipt(baseReceipt, {
        ok: false,
        error: "Unknown host",
        code: "HOST_NOT_FOUND",
        exitCode: null,
      });
      return { ok: false, statusCode: 400, receipt, code: "HOST_NOT_FOUND" };
    }

    const remoteResult = await callRemoteRunner({
      baseUrl: host.baseUrl,
      secret: host.secret,
      action,
      requestId,
      timeoutMs: config.timeoutMs,
    }).catch((error) => ({
      ok: false,
      code: "REMOTE_FETCH_FAILED",
      error: error?.message || "Remote request failed",
      exitCode: null,
      requestId,
      action,
      status: 502,
    }));

    const receipt = await finalizeReceipt(baseReceipt, {
      ...remoteResult,
      durationMs: undefined,
    });

    if (!remoteResult.ok) {
      return { ok: false, statusCode: remoteResult.status || 502, receipt, code: remoteResult.code || "REMOTE_ERROR" };
    }

    return { ok: true, statusCode: 200, receipt, code: "OK" };
  }

  return {
    config,
    runLocal,
    runRemote,
  };
}

export function createOpsRouter(express, options = {}) {
  const router = express.Router();
  const controller = createOpsController(options);

  router.post("/ops/local", async (req, res) => {
    const requestId = String(req.body?.requestId || crypto.randomUUID());
    const action = String(req.body?.action || "").trim();

    if (!isApproved(controller.config.approval, action, req.headers["x-ops-approved"])) {
      return res.status(403).json({ ok: false, requestId, error: "Approval required", code: "APPROVAL_REQUIRED" });
    }

    const result = await controller.runLocal({
      action,
      requestId,
      origin: req.ip || req.socket?.remoteAddress || "unknown",
    });

    if (!result.ok) {
      return res.status(result.statusCode).json({
        ok: false,
        requestId,
        error: result.receipt.errorSummary || "Action failed",
        code: result.code,
      });
    }

    return res.status(200).json({
      ok: true,
      requestId,
      action,
      exitCode: result.receipt.exitCode,
    });
  });

  router.post("/ops/remote", async (req, res) => {
    const requestId = String(req.body?.requestId || crypto.randomUUID());
    const action = String(req.body?.action || "").trim();
    const hostKey = String(req.body?.hostKey || "").trim();

    if (!isApproved(controller.config.approval, action, req.headers["x-ops-approved"])) {
      return res.status(403).json({ ok: false, requestId, error: "Approval required", code: "APPROVAL_REQUIRED" });
    }

    const result = await controller.runRemote({
      hostKey,
      action,
      requestId,
      origin: req.ip || req.socket?.remoteAddress || "unknown",
    });

    if (!result.ok) {
      return res.status(result.statusCode).json({
        ok: false,
        requestId,
        error: result.receipt.errorSummary || "Remote action failed",
        code: result.code,
      });
    }

    return res.status(200).json({
      ok: true,
      requestId,
      action,
      exitCode: result.receipt.exitCode,
    });
  });

  return router;
}
