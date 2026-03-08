import http from "node:http";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";

const DEFAULT_CONFIG = {
  port: 8787,
  bindHost: "127.0.0.1",
  secretEnvVar: "OPS_SECRET",
  scriptsRoot: "C:\\NxtLvl\\ops",
  allowedActions: {
    "start-horizon": "start-horizon.ps1",
    "restart-horizon": "restart-horizon.ps1",
    "reconnect-gateway": "reconnect-gateway.ps1",
    "open-logs": "open-logs.ps1",
  },
  ipAllowlist: [],
  maxBodyBytes: 10 * 1024,
  maxTimestampSkewMs: 60_000,
  replayWindowMs: 120_000,
  logFile: path.resolve(process.cwd(), "horizon/runtime/logs/ops-runner.log"),
  receiptRoot: path.resolve(process.cwd(), "horizon/runtime/ops/receipts"),
};

function nowIso() {
  return new Date().toISOString();
}

function getDateFolder(isoTs) {
  return isoTs.slice(0, 10);
}

async function appendLog(logFile, line) {
  const full = `${line}\n`;
  console.log(line);
  await fs.mkdir(path.dirname(logFile), { recursive: true });
  await fs.appendFile(logFile, full, "utf8");
}

function sha256Hex(secret, input) {
  return crypto.createHmac("sha256", secret).update(input).digest("hex");
}

function timingSafeHexEqual(aHex, bHex) {
  if (typeof aHex !== "string" || typeof bHex !== "string") return false;
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function normalizeIp(ip) {
  if (!ip) return "";
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip;
}

function ipv4ToInt(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let acc = 0;
  for (const part of parts) {
    const num = Number(part);
    if (!Number.isInteger(num) || num < 0 || num > 255) return null;
    acc = (acc << 8) + num;
  }
  return acc >>> 0;
}

function cidrMatch(ip, cidr) {
  const [base, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw);
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  if (ipInt === null || baseInt === null) return false;
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

export function isIpAllowed(ip, allowlist) {
  if (!Array.isArray(allowlist) || allowlist.length === 0) return true;
  const normalized = normalizeIp(ip);
  if (normalized === "127.0.0.1" || normalized === "::1") return true;

  for (const entryRaw of allowlist) {
    const entry = String(entryRaw || "").trim();
    if (!entry) continue;
    if (entry.includes("/")) {
      if (cidrMatch(normalized, entry)) return true;
    } else if (normalizeIp(entry) === normalized) {
      return true;
    }
  }

  return false;
}

export function verifySignedPayload({
  secret,
  signatureHex,
  timestamp,
  rawBody,
  maxTimestampSkewMs,
  nowMs = Date.now(),
}) {
  if (!secret) return { ok: false, code: "SECRET_MISSING" };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, code: "TIMESTAMP_INVALID" };
  if (Math.abs(nowMs - ts) > maxTimestampSkewMs) {
    return { ok: false, code: "TIMESTAMP_EXPIRED" };
  }

  const expected = sha256Hex(secret, `${ts}.${rawBody}`);
  if (!timingSafeHexEqual(expected, signatureHex)) {
    return { ok: false, code: "SIGNATURE_INVALID" };
  }

  return { ok: true };
}

export function createReplayGuard(windowMs = 120_000) {
  const seen = new Map();

  function purge(nowMs) {
    for (const [key, ts] of seen) {
      if (nowMs - ts > windowMs) seen.delete(key);
    }
  }

  return {
    has(requestId, nowMs = Date.now()) {
      purge(nowMs);
      return seen.has(requestId);
    },
    add(requestId, nowMs = Date.now()) {
      purge(nowMs);
      seen.set(requestId, nowMs);
    },
    _size() {
      return seen.size;
    },
  };
}

function sanitizeScriptName(fileName) {
  const normalized = String(fileName || "").trim();
  if (!/^[a-zA-Z0-9._-]+\.ps1$/.test(normalized)) return null;
  if (normalized.includes("..") || normalized.includes("/") || normalized.includes("\\")) {
    return null;
  }
  return normalized;
}

function resolveActionScript(config, action) {
  const mapped = config.allowedActions?.[action];
  const scriptName = sanitizeScriptName(mapped);
  if (!scriptName) return null;
  return path.join(config.scriptsRoot, scriptName);
}

async function writeReceipt(config, receipt) {
  const dateFolder = getDateFolder(receipt.finishedAt || receipt.startedAt || nowIso());
  const dir = path.join(config.receiptRoot, dateFolder);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${receipt.requestId}.json`);
  await fs.writeFile(filePath, JSON.stringify(receipt, null, 2), "utf8");
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return normalizeIp(forwarded.split(",")[0].trim());
  }
  return normalizeIp(req.socket.remoteAddress || "");
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let raw = "";
    req.setEncoding("utf8");

    req.on("data", (chunk) => {
      size += Buffer.byteLength(chunk, "utf8");
      if (size > maxBytes) {
        reject(Object.assign(new Error("Body too large"), { statusCode: 413, code: "BODY_TOO_LARGE" }));
        req.destroy();
        return;
      }
      raw += chunk;
    });

    req.on("end", () => resolve(raw));
    req.on("error", (err) => reject(err));
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

export function executeWhitelistedAction({ scriptPath, requestId }) {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn(
      "powershell.exe",
      ["-ExecutionPolicy", "Bypass", "-File", scriptPath],
      { windowsHide: true, stdio: "ignore" },
    );

    child.on("error", (err) => {
      resolve({
        ok: false,
        requestId,
        exitCode: null,
        durationMs: Date.now() - start,
        errorSummary: err?.message || "Failed to start script",
      });
    });

    child.on("close", (exitCode) => {
      resolve({
        ok: exitCode === 0,
        requestId,
        exitCode: typeof exitCode === "number" ? exitCode : null,
        durationMs: Date.now() - start,
      });
    });
  });
}

export async function handleRunRequest({ req, res, config, replayGuard }) {
  const startedAt = nowIso();
  const startedMs = Date.now();
  const machine = os.hostname();
  const origin = getClientIp(req);

  if (!isIpAllowed(origin, config.ipAllowlist)) {
    return sendJson(res, 403, { ok: false, error: "Forbidden", code: "IP_NOT_ALLOWED" });
  }

  if ((req.headers["content-type"] || "").toString().toLowerCase().includes("application/json") === false) {
    return sendJson(res, 400, { ok: false, error: "Invalid request", code: "BAD_CONTENT_TYPE" });
  }

  let rawBody = "";
  try {
    rawBody = await readBody(req, config.maxBodyBytes);
  } catch (error) {
    const statusCode = error?.statusCode || 400;
    const code = error?.code || "INVALID_BODY";
    return sendJson(res, statusCode, { ok: false, error: "Invalid request", code });
  }

  const timestamp = req.headers["x-ops-timestamp"];
  const signatureHex = req.headers["x-ops-signature"];

  const secret = process.env[config.secretEnvVar] || "";
  const verified = verifySignedPayload({
    secret,
    signatureHex: String(signatureHex || ""),
    timestamp,
    rawBody,
    maxTimestampSkewMs: config.maxTimestampSkewMs,
  });

  if (!verified.ok) {
    return sendJson(res, 401, { ok: false, error: "Unauthorized", code: verified.code });
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return sendJson(res, 400, { ok: false, error: "Invalid request", code: "JSON_PARSE_FAILED" });
  }

  const action = String(body?.action || "").trim();
  const requestId = String(body?.requestId || "").trim();

  if (!/^[a-zA-Z0-9._:-]{6,128}$/.test(requestId)) {
    return sendJson(res, 400, { ok: false, requestId, error: "Invalid request", code: "REQUEST_ID_INVALID" });
  }

  if (replayGuard.has(requestId)) {
    return sendJson(res, 409, { ok: false, requestId, error: "Duplicate request", code: "REPLAY_DETECTED" });
  }
  replayGuard.add(requestId);

  const scriptPath = resolveActionScript(config, action);
  if (!scriptPath) {
    return sendJson(res, 400, { ok: false, requestId, error: "Invalid request", code: "ACTION_NOT_ALLOWED" });
  }

  let result;
  try {
    result = await executeWhitelistedAction({ scriptPath, requestId });
  } catch {
    result = {
      ok: false,
      requestId,
      exitCode: null,
      durationMs: Date.now() - startedMs,
      errorSummary: "Execution failed",
    };
  }

  const finishedAt = nowIso();
  const receipt = {
    requestId,
    action,
    machine,
    origin,
    startedAt,
    finishedAt,
    status: result.ok ? "success" : "failed",
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    errorSummary: result.errorSummary || null,
  };

  try {
    await writeReceipt(config, receipt);
  } catch {
    // Intentionally ignore write errors to avoid leaking internals to clients.
  }

  const logLine = `[${finishedAt}] [${requestId}] action=${action} status=${receipt.status} exitCode=${receipt.exitCode ?? "null"} durationMs=${receipt.durationMs}`;
  await appendLog(config.logFile, logLine).catch(() => undefined);

  if (!result.ok) {
    return sendJson(res, 500, {
      ok: false,
      requestId,
      error: "Action failed",
      code: "ACTION_FAILED",
    });
  }

  return sendJson(res, 200, {
    ok: true,
    requestId,
    action,
    exitCode: result.exitCode,
  });
}

export function createRunnerServer(config = DEFAULT_CONFIG) {
  const merged = { ...DEFAULT_CONFIG, ...config };
  const replayGuard = createReplayGuard(merged.replayWindowMs);

  const server = http.createServer(async (req, res) => {
    if (!req.url || req.method !== "POST" || req.url !== "/run") {
      return sendJson(res, 404, { ok: false, error: "Not found", code: "NOT_FOUND" });
    }

    try {
      await handleRunRequest({ req, res, config: merged, replayGuard });
    } catch {
      sendJson(res, 500, { ok: false, error: "Internal error", code: "INTERNAL_ERROR" });
    }
  });

  return { server, config: merged };
}

export async function loadConfig(configPath) {
  const effectivePath = configPath || path.resolve(process.cwd(), "horizon/ops/runner/config.json");
  try {
    const raw = await fs.readFile(effectivePath, "utf8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

async function startFromCli() {
  const configPath = process.argv[2];
  const loadedConfig = await loadConfig(configPath);
  const { server, config } = createRunnerServer(loadedConfig);

  server.listen(config.port, config.bindHost, async () => {
    await appendLog(
      config.logFile,
      `[${nowIso()}] [bootstrap] ops-runner listening on http://${config.bindHost}:${config.port}`,
    ).catch(() => undefined);
  });
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  startFromCli().catch((error) => {
    console.error("ops-runner failed to start", error);
    process.exit(1);
  });
}
