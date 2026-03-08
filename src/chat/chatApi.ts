// ---------------------------------------------------------------------------
// Chat API layer — HTTP endpoints + SSE stream
// ---------------------------------------------------------------------------

import type { ChatMessage, ChatEvent, ApprovalRequest, MessageMeta } from "@/types/chat";
import { getAuthHeaders, getGatewayUrl } from "@/api/auth";
import { z } from "zod";

const GATEWAY_URL = getGatewayUrl();

const conversationIdSchema = z.string().trim().min(1);
const messageSchema = z.string().trim().min(1).max(20_000);
const clientMessageIdSchema = z.string().trim().min(1).max(200);
const approvalIdSchema = z.string().trim().min(1).max(200);

// ---------------------------------------------------------------------------
// Normalizer — map whatever the server returns into a ChatMessage
// ---------------------------------------------------------------------------
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asMessageMeta(value: unknown): MessageMeta | undefined {
  if (!isRecord(value)) return undefined;
  return value as MessageMeta;
}

export function normalizeMessage(rawInput: unknown): ChatMessage {
  const raw = isRecord(rawInput) ? rawInput : {};
  // Determine direction: server uses "role" (user/assistant) or "direction" (in/out)
  let direction: "in" | "out" = "in";
  if (raw.direction === "out" || raw.sender === "user" || raw.role === "user") {
    direction = "out";
  }

  return {
    id: asString(raw.id) ?? asString(raw.messageId) ?? "",
    clientMessageId: asString(raw.clientMessageId) ?? "",
    direction,
    text: asString(raw.text) ?? asString(raw.content) ?? asString(raw.message) ?? "",
    ts:
      asString(raw.ts) ??
      asString(raw.createdAt) ??
      asString(raw.timestamp) ??
      new Date().toISOString(),
    status: (asString(raw.status) as ChatMessage["status"]) ?? "sent",
    meta: asMessageMeta(raw.meta) ?? asMessageMeta(raw.metadata),
  };
}

// ---------------------------------------------------------------------------
// Send a message
// ---------------------------------------------------------------------------
export async function sendChatMessage(
  conversationId: string,
  text: string,
  clientMessageId: string,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = z
    .object({ conversationId: conversationIdSchema, text: messageSchema, clientMessageId: clientMessageIdSchema })
    .safeParse({ conversationId, text, clientMessageId });
  if (!parsed.success) {
    return { ok: false, error: "Invalid message payload." };
  }

  const res = await fetch(`${GATEWAY_URL}/api/chat/send`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      conversationId: parsed.data.conversationId,
      message: parsed.data.text,
      clientMessageId: parsed.data.clientMessageId,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: body || `HTTP ${res.status}` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Fetch chat history (paginated)
// ---------------------------------------------------------------------------
export interface HistoryPage {
  messages: ChatMessage[];
  olderCursor: string | null;
}

export async function fetchChatHistory(
  conversationId: string,
  cursor?: string | null,
): Promise<HistoryPage> {
  const convParsed = conversationIdSchema.safeParse(conversationId);
  if (!convParsed.success) return { messages: [], olderCursor: null };

  const params = new URLSearchParams({ conversationId });
  if (cursor) params.set("cursor", cursor);

  const res = await fetch(`${GATEWAY_URL}/api/chat/history?${params}`, {
    headers: getAuthHeaders(),
  });
  // Gateway may not implement this endpoint yet — treat 404 as empty
  if (!res.ok) return { messages: [], olderCursor: null };

  const data: unknown = await res.json();
  const raw = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.messages)
      ? data.messages
      : [];
  return {
    messages: raw.map(normalizeMessage),
    olderCursor:
      isRecord(data) ? (asString(data.olderCursor) ?? asString(data.cursor) ?? null) : null,
  };
}

// ---------------------------------------------------------------------------
// Reconnect sync — get events since a known eventId
// ---------------------------------------------------------------------------
export async function fetchChatSync(
  conversationId: string,
  lastEventId: string,
): Promise<ChatEvent[]> {
  const convParsed = conversationIdSchema.safeParse(conversationId);
  if (!convParsed.success) return [];

  const params = new URLSearchParams({ conversationId, since: lastEventId });
  const res = await fetch(`${GATEWAY_URL}/api/chat/sync?${params}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : data.events ?? [];
}

// ---------------------------------------------------------------------------
// Approval response
// ---------------------------------------------------------------------------
export async function respondToApproval(
  approvalId: string,
  decision: "approve" | "deny",
): Promise<{ ok: boolean; error?: string }> {
  const parsed = z
    .object({ approvalId: approvalIdSchema, decision: z.enum(["approve", "deny"]) })
    .safeParse({ approvalId, decision });
  if (!parsed.success) {
    return { ok: false, error: "Invalid approval response." };
  }

  const res = await fetch(`${GATEWAY_URL}/api/approval/respond`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(parsed.data),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: body || `HTTP ${res.status}` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// SSE Event Source factory
// ---------------------------------------------------------------------------
export interface SSECallbacks {
  onEvent: (event: ChatEvent) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onReconnecting: () => void;
}

/**
 * Opens an authenticated SSE stream to `/api/events?conversationId=...`.
 * Uses `fetch()` + ReadableStream parsing (so we can send auth headers).
 * Returns a cleanup function to abort the connection.
 */
export function openEventStream(
  conversationId: string,
  callbacks: SSECallbacks,
  lastEventId?: string | null,
): () => void {
  const convParsed = conversationIdSchema.safeParse(conversationId);
  if (!convParsed.success) {
    callbacks.onDisconnected();
    return () => {};
  }

  const eventTypes: ChatEvent["type"][] = [
    "message.created",
    "message.updated",
    "run.started",
    "run.finished",
    "approval.required",
    "error",
  ];

  const eventTypeSet = new Set<ChatEvent["type"]>(eventTypes);
  function isChatEventType(value: string): value is ChatEvent["type"] {
    return eventTypeSet.has(value as ChatEvent["type"]);
  }

  let closed = false;
  let retryDelayMs = 1_000;
  const retryDelayMaxMs = 30_000;
  let controller: AbortController | null = null;

  function scheduleReconnect() {
    if (closed) return;
    callbacks.onReconnecting();
    const delay = retryDelayMs;
    retryDelayMs = Math.min(retryDelayMs * 2, retryDelayMaxMs);
    console.log(`%c[SSE] Reconnecting in ${delay}ms`, "color:#f59e0b");
    setTimeout(() => {
      if (!closed) void connectOnce();
    }, delay);
  }

  async function connectOnce() {
    controller?.abort();
    controller = new AbortController();

    const params = new URLSearchParams({ conversationId: convParsed.data });
    if (lastEventId) params.set("lastEventId", lastEventId);
    const url = `${GATEWAY_URL}/api/events?${params}`;

    console.group("%c[SSE] Connecting", "color:#0ea5e9;font-weight:bold");
    console.log("URL:", url);
    console.log("Headers:", getAuthHeaders({ Accept: "text/event-stream" }));
    console.groupEnd();

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: getAuthHeaders({ Accept: "text/event-stream" }),
        signal: controller.signal,
      });

      console.log(
        `%c[SSE] Response: ${res.status} ${res.statusText}`,
        res.ok ? "color:#22c55e" : "color:#ef4444",
        { contentType: res.headers.get("content-type"), hasBody: !!res.body },
      );

      if (!res.ok || !res.body) {
        console.warn("[SSE] Non-OK or no body — scheduling reconnect");
        scheduleReconnect();
        return;
      }

      retryDelayMs = 1_000;
      callbacks.onConnected();
      console.log("%c[SSE] Stream open ✓", "color:#22c55e;font-weight:bold");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";
      let currentEventType: string | null = null;
      let currentEventId: string | null = null;
      let currentDataLines: string[] = [];

      const flushEvent = () => {
        if (!currentDataLines.length) return;

        const rawData = currentDataLines.join("\n");
        currentDataLines = [];

        const type = currentEventType ?? "message";

        console.groupCollapsed(
          `%c[SSE] Raw frame  event=%c${type}%c  id=%c${currentEventId ?? "(none)"}`,
          "color:#0ea5e9", "color:#f59e0b;font-weight:bold", "color:#0ea5e9", "color:#a78bfa",
        );
        console.log(rawData);
        console.groupEnd();

        // If server doesn't set an explicit event type, attempt to infer.
        let parsedData: Record<string, unknown>;
        try {
          const parsed: unknown = JSON.parse(rawData);
          parsedData = isRecord(parsed) ? parsed : { message: rawData };
        } catch {
          parsedData = { message: rawData };
        }

        const inferredType = asString(parsedData.type);
        const resolvedType: ChatEvent["type"] | null =
          isChatEventType(type)
            ? type
            : inferredType && isChatEventType(inferredType)
              ? inferredType
              : null;

        if (!resolvedType) {
          console.warn("[SSE] Dropping frame — unrecognised type:", type, inferredType);
          currentEventType = null;
          currentEventId = null;
          return;
        }

        const chatEvent: ChatEvent = {
          eventId: asString(parsedData.eventId) ?? currentEventId ?? `${Date.now()}`,
          type: resolvedType,
          ts: asString(parsedData.ts) ?? new Date().toISOString(),
          sequence: typeof parsedData.sequence === "number" ? parsedData.sequence : 0,
          data: parsedData,
        };

        console.log(
          `%c[SSE] Parsed event  %c${chatEvent.type}%c  id=${chatEvent.eventId}`,
          "color:#0ea5e9", "color:#22c55e;font-weight:bold", "color:#0ea5e9",
          chatEvent.data,
        );

        callbacks.onEvent(chatEvent);
        currentEventType = null;
        currentEventId = null;
      };

      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines; keep a partial line in the buffer.
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line) {
            flushEvent();
            continue;
          }

          if (line.startsWith(":")) {
            // comment/heartbeat
            continue;
          }

          const idx = line.indexOf(":");
          const field = idx === -1 ? line : line.slice(0, idx);
          const value = idx === -1 ? "" : line.slice(idx + 1).trimStart();

          if (field === "event") currentEventType = value;
          else if (field === "id") currentEventId = value;
          else if (field === "data") currentDataLines.push(value);
        }
      }

      console.log("%c[SSE] Stream ended (reader done)", "color:#f59e0b");
      if (!closed) scheduleReconnect();
    } catch (err) {
      console.error("[SSE] Connection error:", err);
      if (!closed) scheduleReconnect();
    }
  }

  void connectOnce();

  return () => {
    closed = true;
    controller?.abort();
    callbacks.onDisconnected();
  };
}
