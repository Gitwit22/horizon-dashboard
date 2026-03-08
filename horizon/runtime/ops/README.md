# Horizon Ops Controller

This folder contains controller-side ops orchestration for local and remote action execution.

## Files

- `opsController.js` — signing, remote call wrapper, local/remote execution helpers, Express router factory.
- `opsHosts.example.json` — sample host map (`hostKey -> { baseUrl, secret }`).

## Endpoints

Mount router from your main server:

```js
import express from "express";
import { createOpsRouter } from "./horizon/runtime/ops/opsController.js";
import opsHosts from "./horizon/runtime/ops/opsHosts.json" assert { type: "json" };

const app = express();
app.use(express.json({ limit: "10kb" }));
app.use("/api", createOpsRouter(express, { opsHosts }));
```

Exposed routes:

- `POST /api/ops/local` body `{ action, requestId? }`
- `POST /api/ops/remote` body `{ hostKey, action, requestId? }`

## Approval support

Set:

```js
createOpsRouter(express, {
  opsHosts,
  approval: {
    enabled: true,
    highRiskActions: ["start-horizon", "restart-horizon"],
  },
});
```

Then require header `x-ops-approved: true` for high-risk actions.

## Receipts + logs

- Receipts: `horizon/runtime/ops/receipts/YYYY-MM-DD/<requestId>.json`
- Controller log: `horizon/runtime/logs/ops-controller.log`

## Security guardrails

- Whitelisted action names only.
- Static script filename mapping only.
- HMAC signing for remote calls.
- Generic error payloads to clients.
