// Shared auth + gateway helpers for Horizon Console API calls

// In dev mode use relative URLs so the Vite proxy handles /api/* requests and
// avoids CORS. In production (Electron file:// or explicit env override) use
// the full gateway origin.
const GATEWAY_URL: string =
  import.meta.env.VITE_GATEWAY_URL ??
  (import.meta.env.DEV ? "" : "http://10.0.0.194:3001");

const USER_ID = import.meta.env.VITE_USER_ID || "console-user";
const WORKSPACE_ID = import.meta.env.VITE_WORKSPACE_ID || "";
const AUTH_TOKEN = import.meta.env.VITE_AUTH_TOKEN || "";

export function getGatewayUrl(): string {
  return GATEWAY_URL;
}

/**
 * Returns headers for Horizon gateway requests.
 *
 * Preferred: `Authorization: Bearer <token>` via `VITE_AUTH_TOKEN`.
 * Fallback (dev/internal gateways): `x-user-id` via `VITE_USER_ID`.
 */
export function getAuthHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    ...extra,
  };

  if (AUTH_TOKEN) {
    headers.Authorization = `Bearer ${AUTH_TOKEN}`;
  } else {
    headers["x-user-id"] = USER_ID;
  }

  if (WORKSPACE_ID) {
    headers["x-workspace-id"] = WORKSPACE_ID;
  }

  return headers;
}
