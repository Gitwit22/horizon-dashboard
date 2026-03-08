import React, {
  createContext,
  useReducer,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import type {
  ChatMessage,
  ChatEvent,
  ApprovalRequest,
  MessageMeta,
} from "@/types/chat";
import { chatReducer, initialChatState } from "@/chat/chatStore";
import {
  sendChatMessage,
  fetchChatHistory,
  fetchChatSync,
  respondToApproval,
  openEventStream,
  normalizeMessage,
} from "@/chat/chatApi";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let _seqCounter = 0;
function clientId(): string {
  return `cmsg_${Date.now()}_${++_seqCounter}`;
}

// ---------------------------------------------------------------------------
// Context shape (public API consumed by components)
// ---------------------------------------------------------------------------
export interface ChatContextValue {
  /** Ordered list of messages (oldest → newest) */
  messages: ChatMessage[];
  /** Pending approval requests */
  approvals: ApprovalRequest[];
  /** Whether an active run is in progress */
  isRunning: boolean;
  /** SSE connection status */
  connectionStatus: "connected" | "reconnecting" | "disconnected";
  /** Current conversation ID */
  conversationId: string;
  /** True while loading initial history */
  historyLoading: boolean;
  /** True while loading an older page */
  loadingOlderPage: boolean;
  /** Whether there is an older page available */
  hasOlderPage: boolean;

  sendMessage: (text: string, meta?: MessageMeta) => Promise<void>;
  loadOlderPage: () => Promise<void>;
  switchConversation: (id: string) => void;
  respondApproval: (approvalId: string, decision: "approve" | "deny") => Promise<void>;
  clearChat: () => void;
  /** Tear down SSE and reconnect from scratch */
  reconnect: () => void;
}

export const ChatContext = createContext<ChatContextValue | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
const DEFAULT_CONVERSATION = "default";

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [conversationId, setConversationId] = useState(DEFAULT_CONVERSATION);
  const [connectionStatus, setConnectionStatus] = useState<
    "connected" | "reconnecting" | "disconnected"
  >("disconnected");
  const [isRunning, setIsRunning] = useState(false);

  // Track seen eventIds for dedup
  const seenEvents = useRef(new Set<string>());
  // Ref to close the active EventSource
  const closeStream = useRef<(() => void) | null>(null);

  // ------- Event handler (SSE dispatch) -------
  const handleEvent = useCallback((event: ChatEvent) => {
    // Dedup by eventId
    if (seenEvents.current.has(event.eventId)) {
      console.log(`%c[SSE dispatch] Dedup skip %c${event.eventId}`, "color:#64748b", "color:#a78bfa");
      return;
    }
    seenEvents.current.add(event.eventId);
    console.log(
      `%c[SSE dispatch] %c${event.type}%c → store`,
      "color:#0ea5e9", "color:#22c55e;font-weight:bold", "color:#0ea5e9",
      event.data,
    );

    dispatch({ type: "SET_LAST_EVENT_ID", eventId: event.eventId });

    switch (event.type) {
      case "message.created": {
        const msg = normalizeMessage(event.data);
        dispatch({ type: "MESSAGE_CREATED", message: msg });
        break;
      }
      case "message.updated": {
        const { id, messageId, ...changes } = event.data;
        dispatch({
          type: "MESSAGE_UPDATED",
          id: id ?? messageId,
          changes: {
            ...(changes.status ? { status: changes.status } : {}),
            ...(changes.text ? { text: changes.text } : {}),
          },
        });
        break;
      }
      case "run.started":
        setIsRunning(true);
        break;
      case "run.finished":
        setIsRunning(false);
        break;
      case "approval.required":
        dispatch({
          type: "APPROVAL_REQUIRED",
          approval: {
            approvalId: event.data.approvalId ?? event.data.id,
            summary: event.data.summary ?? "",
            diff: event.data.diff,
            receipt: event.data.receipt,
            ts: event.ts,
            resolved: false,
          },
        });
        break;
      case "error":
        console.error("[SSE dispatch] Server error event:", event.data);
        break;
      default:
        console.warn("[SSE dispatch] Unhandled event type:", event.type, event.data);
        break;
    }
  }, []);

  // ------- Open SSE stream for conversation -------
  const connectStream = useCallback(
    (convId: string, lastEventId?: string | null) => {
      // Close previous stream
      closeStream.current?.();
      seenEvents.current.clear();

      const cleanup = openEventStream(convId, {
        onEvent: handleEvent,
        onConnected: () => setConnectionStatus("connected"),
        onDisconnected: () => setConnectionStatus("disconnected"),
        onReconnecting: () => setConnectionStatus("reconnecting"),
      }, lastEventId);

      closeStream.current = cleanup;
    },
    [handleEvent],
  );

  // ------- Load initial history + open stream on mount / conversation switch -------
  useEffect(() => {
    let cancelled = false;

    async function init() {
      dispatch({ type: "CLEAR" });
      setIsRunning(false);

      try {
        const page = await fetchChatHistory(conversationId);
        if (cancelled) return;
        dispatch({
          type: "HISTORY_LOADED",
          messages: page.messages,
          olderCursor: page.olderCursor,
        });
      } catch {
        if (!cancelled) {
          dispatch({ type: "HISTORY_LOADED", messages: [], olderCursor: null });
        }
      }

      // Open SSE
      connectStream(conversationId, null);
    }

    init();

    return () => {
      cancelled = true;
      closeStream.current?.();
    };
  }, [conversationId, connectStream]);

  // ------- Reconnect sync (when SSE reconnects) -------
  useEffect(() => {
    if (connectionStatus !== "connected") return;
    if (!state.lastEventId) return;

    // On reconnect, fetch missed events
    fetchChatSync(conversationId, state.lastEventId).then((events) => {
      for (const ev of events) handleEvent(ev);
    }).catch(() => {
      // If sync endpoint doesn't exist, reload latest history page
      fetchChatHistory(conversationId).then((page) => {
        for (const msg of page.messages) {
          dispatch({ type: "MESSAGE_CREATED", message: msg });
        }
      });
    });
    // Only run on reconnect, not every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionStatus]);

  // ------- Public actions -------

  const sendMessage = useCallback(
    async (text: string, meta?: MessageMeta) => {
      const cid = clientId();
      const optimistic: ChatMessage = {
        id: "",
        clientMessageId: cid,
        direction: "out",
        text,
        ts: new Date().toISOString(),
        status: "sending",
        meta,
      };

      console.log(`%c[Chat] Sending message %c${cid}`, "color:#0ea5e9", "color:#a78bfa", { text });

      // Optimistically render
      dispatch({ type: "OPTIMISTIC_SEND", message: optimistic });

      // POST to the server
      const result = await sendChatMessage(conversationId, text, cid);

      if (!result.ok) {
        console.warn(`[Chat] Send failed for ${cid}:`, result.error);
        // Mark the optimistic message as failed
        dispatch({
          type: "MESSAGE_UPDATED",
          id: cid, // the store key for pending messages is the clientMessageId
          changes: { status: "failed" },
        });
      } else {
        console.log(`%c[Chat] POST succeeded for %c${cid}`, "color:#22c55e", "color:#a78bfa");
        // Mark as sent immediately — don't wait for SSE reconciliation
        // (SSE message.created will reconcile the server ID when it arrives)
        dispatch({
          type: "MESSAGE_UPDATED",
          id: cid,
          changes: { status: "sent" },
        });
      }
    },
    [conversationId],
  );

  const loadOlderPage = useCallback(async () => {
    if (!state.olderCursor || state.loadingOlderPage) return;
    dispatch({ type: "OLDER_PAGE_LOADING" });
    try {
      const page = await fetchChatHistory(conversationId, state.olderCursor);
      dispatch({
        type: "OLDER_PAGE_LOADED",
        messages: page.messages,
        olderCursor: page.olderCursor,
      });
    } catch {
      dispatch({ type: "OLDER_PAGE_LOADED", messages: [], olderCursor: state.olderCursor });
    }
  }, [conversationId, state.olderCursor, state.loadingOlderPage]);

  const switchConversation = useCallback((id: string) => {
    setConversationId(id);
  }, []);

  const respondApproval = useCallback(
    async (approvalId: string, decision: "approve" | "deny") => {
      dispatch({ type: "APPROVAL_RESOLVED", approvalId, decision });
      await respondToApproval(approvalId, decision);
    },
    [],
  );

  const clearChat = useCallback(() => {
    dispatch({ type: "CLEAR" });
  }, []);

  const reconnect = useCallback(() => {
    closeStream.current?.();
    setConnectionStatus("reconnecting");
    connectStream(conversationId, null);
  }, [conversationId, connectStream]);

  // ------- Derived values -------
  const messages = useMemo(
    () => state.messageOrder.map((k) => state.messagesById[k]).filter(Boolean),
    [state.messagesById, state.messageOrder],
  );

  const approvals = useMemo(
    () => Object.values(state.approvals).filter((a) => !a.resolved),
    [state.approvals],
  );

  const value: ChatContextValue = useMemo(
    () => ({
      messages,
      approvals,
      isRunning,
      connectionStatus,
      conversationId,
      historyLoading: state.historyLoading,
      loadingOlderPage: state.loadingOlderPage,
      hasOlderPage: !!state.olderCursor,
      sendMessage,
      loadOlderPage,
      switchConversation,
      respondApproval,
      clearChat,
      reconnect,
    }),
    [
      messages,
      approvals,
      isRunning,
      connectionStatus,
      conversationId,
      state.historyLoading,
      state.loadingOlderPage,
      state.olderCursor,
      sendMessage,
      loadOlderPage,
      switchConversation,
      respondApproval,
      clearChat,
      reconnect,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useChat(): ChatContextValue {
  const context = React.useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within ChatProvider");
  }
  return context;
}

