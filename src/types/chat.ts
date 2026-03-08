// ---------------------------------------------------------------------------
// Chat types — single source of truth for the entire chat subsystem
// ---------------------------------------------------------------------------

export type MessageDirection = "in" | "out";
export type MessageStatus = "sending" | "sent" | "failed";

export interface MessageMeta {
  provider?: string;
  skill?: string;
  attribution?: string;
  runId?: string;
  [key: string]: unknown;
}

export interface ChatMessage {
  /** Server-assigned ID (empty until confirmed) */
  id: string;
  /** Client-generated ID for optimistic reconciliation */
  clientMessageId: string;
  direction: MessageDirection;
  text: string;
  ts: string; // ISO-8601
  status: MessageStatus;
  meta?: MessageMeta;
}

// ---------------------------------------------------------------------------
// SSE event types coming from the server
// ---------------------------------------------------------------------------

export type ChatEventType =
  | "message.created"
  | "message.updated"
  | "run.started"
  | "run.finished"
  | "approval.required"
  | "error";

export interface ChatEvent {
  eventId: string;
  type: ChatEventType;
  ts: string;
  sequence: number;
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Approval gate types
// ---------------------------------------------------------------------------

export interface ApprovalRequest {
  approvalId: string;
  summary: string;
  diff?: string;
  receipt?: string;
  ts: string;
  resolved: boolean;
  decision?: "approve" | "deny";
}

// ---------------------------------------------------------------------------
// Normalized message store shape
// ---------------------------------------------------------------------------

export interface ChatStoreState {
  messagesById: Record<string, ChatMessage>;
  messageOrder: string[]; // ordered IDs (oldest → newest)
  pendingByClientId: Record<string, string>; // clientMessageId → store key
  approvals: Record<string, ApprovalRequest>;
  /** The last eventId we have processed — used for reconnect sync */
  lastEventId: string | null;
  /** Cursor for backward pagination */
  olderCursor: string | null;
  /** True while we're loading the first page of history */
  historyLoading: boolean;
  /** True while loading an older page */
  loadingOlderPage: boolean;
}

export type ChatStoreAction =
  | { type: "HISTORY_LOADED"; messages: ChatMessage[]; olderCursor: string | null }
  | { type: "OLDER_PAGE_LOADING" }
  | { type: "OLDER_PAGE_LOADED"; messages: ChatMessage[]; olderCursor: string | null }
  | { type: "OPTIMISTIC_SEND"; message: ChatMessage }
  | { type: "MESSAGE_CREATED"; message: ChatMessage }
  | { type: "MESSAGE_UPDATED"; id: string; changes: Partial<ChatMessage> }
  | { type: "APPROVAL_REQUIRED"; approval: ApprovalRequest }
  | { type: "APPROVAL_RESOLVED"; approvalId: string; decision: "approve" | "deny" }
  | { type: "SET_LAST_EVENT_ID"; eventId: string }
  | { type: "CLEAR" };
