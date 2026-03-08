// ---------------------------------------------------------------------------
// Normalized, reducer-based chat message store
// ---------------------------------------------------------------------------

import type {
  ChatStoreState,
  ChatStoreAction,
  ChatMessage,
} from "@/types/chat";

export const initialChatState: ChatStoreState = {
  messagesById: {},
  messageOrder: [],
  pendingByClientId: {},
  approvals: {},
  lastEventId: null,
  olderCursor: null,
  historyLoading: true,
  loadingOlderPage: false,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive the canonical store key for a message (prefer server id) */
function storeKey(msg: ChatMessage): string {
  return msg.id || msg.clientMessageId;
}

/**
 * Insert a message maintaining chronological order.
 * Uses `ts` for ordering; equal timestamps fall back to existing position.
 */
function insertOrdered(order: string[], byId: Record<string, ChatMessage>, key: string): string[] {
  if (order.includes(key)) return order;
  const msgTs = byId[key]?.ts ?? "";
  // Quick path: append if newer than last
  const lastKey = order[order.length - 1];
  if (!lastKey || msgTs >= (byId[lastKey]?.ts ?? "")) {
    return [...order, key];
  }
  // Binary-ish insert for older messages (prepend path — happens during pagination)
  const result = [...order];
  let i = 0;
  while (i < result.length && (byId[result[i]]?.ts ?? "") < msgTs) i++;
  result.splice(i, 0, key);
  return result;
}

/** Prepend a batch of older messages while keeping order */
function prependBatch(
  state: ChatStoreState,
  messages: ChatMessage[],
): Pick<ChatStoreState, "messagesById" | "messageOrder"> {
  const byId = { ...state.messagesById };
  const keys: string[] = [];

  for (const msg of messages) {
    const key = storeKey(msg);
    if (byId[key]) continue; // dedup
    byId[key] = msg;
    keys.push(key);
  }

  // prepend in order
  const messageOrder = [...keys, ...state.messageOrder];
  return { messagesById: byId, messageOrder };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function chatReducer(state: ChatStoreState, action: ChatStoreAction): ChatStoreState {
  switch (action.type) {
    // ----- Initial history load -----
    case "HISTORY_LOADED": {
      const byId: Record<string, ChatMessage> = {};
      const order: string[] = [];
      for (const msg of action.messages) {
        const key = storeKey(msg);
        byId[key] = msg;
        order.push(key);
      }
      return {
        ...state,
        messagesById: byId,
        messageOrder: order,
        pendingByClientId: {},
        olderCursor: action.olderCursor,
        historyLoading: false,
      };
    }

    // ----- Scroll-up pagination -----
    case "OLDER_PAGE_LOADING":
      return { ...state, loadingOlderPage: true };

    case "OLDER_PAGE_LOADED": {
      const { messagesById, messageOrder } = prependBatch(state, action.messages);
      return {
        ...state,
        messagesById,
        messageOrder,
        olderCursor: action.olderCursor,
        loadingOlderPage: false,
      };
    }

    // ----- Optimistic send -----
    case "OPTIMISTIC_SEND": {
      const msg = action.message;
      const key = msg.clientMessageId; // no server id yet
      const messagesById = { ...state.messagesById, [key]: msg };
      const messageOrder = [...state.messageOrder, key];
      const pendingByClientId = { ...state.pendingByClientId, [msg.clientMessageId]: key };
      return { ...state, messagesById, messageOrder, pendingByClientId };
    }

    // ----- Server confirmed a message (could reconcile optimistic) -----
    case "MESSAGE_CREATED": {
      const msg = action.message;
      const serverKey = storeKey(msg);

      // Already have it? (idempotent)
      if (state.messagesById[serverKey]) return state;

      // Reconcile with an optimistic message?
      const pendingKey = msg.clientMessageId
        ? state.pendingByClientId[msg.clientMessageId]
        : undefined;

      const messagesById = { ...state.messagesById };
      let messageOrder = [...state.messageOrder];
      const pendingByClientId = { ...state.pendingByClientId };

      if (pendingKey && messagesById[pendingKey]) {
        // Replace optimistic entry with server entry
        delete messagesById[pendingKey];
        messagesById[serverKey] = { ...msg, status: "sent" };
        messageOrder = messageOrder.map((k) => (k === pendingKey ? serverKey : k));
        delete pendingByClientId[msg.clientMessageId];
      } else {
        // New message from the other side (incoming)
        messagesById[serverKey] = msg;
        messageOrder = insertOrdered(messageOrder, messagesById, serverKey);
      }

      return { ...state, messagesById, messageOrder, pendingByClientId };
    }

    // ----- Status update on an existing message -----
    case "MESSAGE_UPDATED": {
      const existing = state.messagesById[action.id];
      if (!existing) return state;
      return {
        ...state,
        messagesById: {
          ...state.messagesById,
          [action.id]: { ...existing, ...action.changes },
        },
      };
    }

    // ----- Approvals -----
    case "APPROVAL_REQUIRED":
      return {
        ...state,
        approvals: {
          ...state.approvals,
          [action.approval.approvalId]: action.approval,
        },
      };

    case "APPROVAL_RESOLVED": {
      const approval = state.approvals[action.approvalId];
      if (!approval) return state;
      return {
        ...state,
        approvals: {
          ...state.approvals,
          [action.approvalId]: { ...approval, resolved: true, decision: action.decision },
        },
      };
    }

    // ----- Bookkeeping -----
    case "SET_LAST_EVENT_ID":
      return { ...state, lastEventId: action.eventId };

    case "CLEAR":
      return { ...initialChatState, historyLoading: false };

    default:
      return state;
  }
}
