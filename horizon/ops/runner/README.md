# ops-runner

`ops-runner` is a minimal remote execution service for Horizon ops actions.

## Security model

- Only static whitelisted actions are accepted.
- Actions resolve to fixed PowerShell scripts in `C:\NxtLvl\ops`.
- Request auth is HMAC SHA-256 over `timestamp + '.' + rawBody`.
- Signature header: `X-Ops-Signature`.
- Timestamp header: `X-Ops-Timestamp` (unix ms), max skew 60s.
- Replay protection: request IDs are cached in memory for 2 minutes.
- Optional IP allowlist supports exact IPv4 and CIDR blocks.
- No dynamic command strings and no user-provided script paths.

## Run

1. Copy `config.example.json` to `config.json`.
2. Set secret env var (default `OPS_SECRET`).
3. Start:

```powershell
$env:OPS_SECRET = "<strong-shared-secret>"
node horizon/ops/runner/ops-runner.js horizon/ops/runner/config.json
```

## API

### `POST /run`

Headers:

- `Content-Type: application/json`
- `X-Ops-Timestamp: <unix ms>`
- `X-Ops-Signature: <hex hmac>`

Body:

```json
{ "action": "start-horizon", "requestId": "f63db90c-2ddd-4786-a0ef-ef4e61589cb9" }
```

Success:

```json
{ "ok": true, "requestId": "...", "action": "start-horizon", "exitCode": 0 }
```

Errors return generic payloads:

```json
{ "ok": false, "requestId": "...", "error": "Invalid request", "code": "ACTION_NOT_ALLOWED" }
```

## Receipts

Receipts are written to:

`horizon/runtime/ops/receipts/YYYY-MM-DD/<requestId>.json`

Each receipt includes:

- `timestamps`
- `machine`
- `action`
- `origin`
- `status`
- `exitCode`
- `durationMs`
- `errorSummary`

## Notes

- The runner does not elevate privileges.
- If scripts require admin, run the script body via preconfigured scheduled task/service.
