// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";

const spawnMock = vi.fn();

vi.mock("node:child_process", () => ({
  spawn: (...args: any[]) => spawnMock(...args),
}));

function buildSignature(secret: string, timestamp: number, body: string) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

function mockSpawnWithExit(exitCode: number) {
  spawnMock.mockImplementation(() => {
    const child = new EventEmitter() as any;
    process.nextTick(() => {
      child.emit("close", exitCode);
    });
    return child;
  });
}

function mockSpawnWithError(message = "spawn failure") {
  spawnMock.mockImplementation(() => {
    const child = new EventEmitter() as any;
    process.nextTick(() => {
      child.emit("error", new Error(message));
    });
    return child;
  });
}

async function createServerHarness(configOverrides: Record<string, unknown> = {}) {
  const { createRunnerServer } = await import("../../horizon/ops/runner/ops-runner.js");
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ops-runner-test-"));
  const config = {
    bindHost: "127.0.0.1",
    port: 0,
    secretEnvVar: "OPS_SECRET",
    scriptsRoot: "C:\\NxtLvl\\ops",
    allowedActions: {
      "start-horizon": "start-horizon.ps1",
      "restart-horizon": "restart-horizon.ps1",
      "reconnect-gateway": "reconnect-gateway.ps1",
    },
    ipAllowlist: ["127.0.0.1"],
    logFile: path.join(tmpRoot, "logs", "ops-runner.log"),
    receiptRoot: path.join(tmpRoot, "receipts"),
    ...configOverrides,
  };

  const { server } = createRunnerServer(config as any);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    server,
    tmpRoot,
    config,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await fs.rm(tmpRoot, { recursive: true, force: true });
    },
  };
}

describe("ops-runner security and execution", () => {
  beforeEach(() => {
    process.env.OPS_SECRET = "test-secret";
    spawnMock.mockReset();
  });

  afterEach(() => {
    delete process.env.OPS_SECRET;
  });

  it("accepts valid signature and executes whitelisted action", async () => {
    mockSpawnWithExit(0);
    const harness = await createServerHarness();

    const payload = { action: "start-horizon", requestId: crypto.randomUUID() };
    const body = JSON.stringify(payload);
    const ts = Date.now();
    const sig = buildSignature("test-secret", ts, body);

    const res = await fetch(`${harness.baseUrl}/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ops-timestamp": String(ts),
        "x-ops-signature": sig,
      },
      body,
    });

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.action).toBe("start-horizon");

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [exe, args, options] = spawnMock.mock.calls[0];
    expect(exe).toBe("powershell.exe");
    expect(args).toEqual([
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join("C:\\NxtLvl\\ops", "start-horizon.ps1"),
    ]);
    expect(options).toMatchObject({ windowsHide: true, stdio: "ignore" });

    await harness.close();
  });

  it("rejects invalid signature", async () => {
    mockSpawnWithExit(0);
    const harness = await createServerHarness();

    const payload = { action: "start-horizon", requestId: crypto.randomUUID() };
    const body = JSON.stringify(payload);
    const ts = Date.now();

    const res = await fetch(`${harness.baseUrl}/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ops-timestamp": String(ts),
        "x-ops-signature": "deadbeef",
      },
      body,
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.code).toBe("SIGNATURE_INVALID");
    expect(spawnMock).not.toHaveBeenCalled();

    await harness.close();
  });

  it("rejects expired timestamp", async () => {
    mockSpawnWithExit(0);
    const harness = await createServerHarness();

    const payload = { action: "start-horizon", requestId: crypto.randomUUID() };
    const body = JSON.stringify(payload);
    const ts = Date.now() - 120_000;
    const sig = buildSignature("test-secret", ts, body);

    const res = await fetch(`${harness.baseUrl}/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ops-timestamp": String(ts),
        "x-ops-signature": sig,
      },
      body,
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.code).toBe("TIMESTAMP_EXPIRED");

    await harness.close();
  });

  it("rejects unknown action", async () => {
    mockSpawnWithExit(0);
    const harness = await createServerHarness();

    const payload = { action: "format-c-drive", requestId: crypto.randomUUID() };
    const body = JSON.stringify(payload);
    const ts = Date.now();
    const sig = buildSignature("test-secret", ts, body);

    const res = await fetch(`${harness.baseUrl}/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ops-timestamp": String(ts),
        "x-ops-signature": sig,
      },
      body,
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("ACTION_NOT_ALLOWED");
    expect(spawnMock).not.toHaveBeenCalled();

    await harness.close();
  });

  it("rejects replayed requestId", async () => {
    mockSpawnWithExit(0);
    const harness = await createServerHarness();

    const requestId = crypto.randomUUID();
    const payload = { action: "start-horizon", requestId };
    const body = JSON.stringify(payload);

    const ts1 = Date.now();
    const sig1 = buildSignature("test-secret", ts1, body);
    const first = await fetch(`${harness.baseUrl}/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ops-timestamp": String(ts1),
        "x-ops-signature": sig1,
      },
      body,
    });
    expect(first.status).toBe(200);

    const ts2 = Date.now();
    const sig2 = buildSignature("test-secret", ts2, body);
    const second = await fetch(`${harness.baseUrl}/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ops-timestamp": String(ts2),
        "x-ops-signature": sig2,
      },
      body,
    });

    expect(second.status).toBe(409);
    const json = await second.json();
    expect(json.code).toBe("REPLAY_DETECTED");

    await harness.close();
  });

  it("writes receipt on success and failure", async () => {
    const harness = await createServerHarness();

    // success
    mockSpawnWithExit(0);
    const successId = crypto.randomUUID();
    const successPayload = { action: "start-horizon", requestId: successId };
    const successBody = JSON.stringify(successPayload);
    const ts1 = Date.now();
    const sig1 = buildSignature("test-secret", ts1, successBody);

    const successRes = await fetch(`${harness.baseUrl}/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ops-timestamp": String(ts1),
        "x-ops-signature": sig1,
      },
      body: successBody,
    });
    expect(successRes.status).toBe(200);

    // failure
    mockSpawnWithError("boom");
    const failId = crypto.randomUUID();
    const failPayload = { action: "restart-horizon", requestId: failId };
    const failBody = JSON.stringify(failPayload);
    const ts2 = Date.now();
    const sig2 = buildSignature("test-secret", ts2, failBody);

    const failRes = await fetch(`${harness.baseUrl}/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ops-timestamp": String(ts2),
        "x-ops-signature": sig2,
      },
      body: failBody,
    });
    expect(failRes.status).toBe(500);

    const date = new Date().toISOString().slice(0, 10);
    const successReceiptPath = path.join(harness.config.receiptRoot as string, date, `${successId}.json`);
    const failReceiptPath = path.join(harness.config.receiptRoot as string, date, `${failId}.json`);

    const successReceiptRaw = await fs.readFile(successReceiptPath, "utf8");
    const failReceiptRaw = await fs.readFile(failReceiptPath, "utf8");
    const successReceipt = JSON.parse(successReceiptRaw);
    const failReceipt = JSON.parse(failReceiptRaw);

    expect(successReceipt.status).toBe("success");
    expect(failReceipt.status).toBe("failed");
    expect(failReceipt.errorSummary).toBeTruthy();

    await harness.close();
  });
});
