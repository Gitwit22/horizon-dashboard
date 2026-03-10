import React, { useState, useRef, useEffect, useCallback } from "react";
import { useChat } from "@/context/ChatContext";
import { ApprovalCard } from "@/components/ApprovalCard";
import { Loader2, WifiOff } from "lucide-react";
import { parseOpsCommand, runOpsCommand } from "@/api/opsApi";
import { toast } from "@/hooks/use-toast";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { VoiceButton } from "@/components/VoiceButton";
import type { ChatMessage } from "@/types/chat";

/** Memoized chat bubble — only re-renders when the message object changes. */
const ChatBubble = React.memo(function ChatBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className={`flex ${msg.direction === "out" ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-xs px-4 py-2 rounded-lg ${
          msg.direction === "out"
            ? "bg-orange-500 text-white"
            : "bg-slate-700 text-slate-100"
        } ${msg.status === "sending" ? "opacity-70" : ""} ${
          msg.status === "failed" ? "border border-red-500" : ""
        }`}
      >
        <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
        <div className="flex items-center gap-1 mt-1">
          <p className="text-xs opacity-70">
            {new Date(msg.ts).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          {msg.status === "sending" && (
            <Loader2 className="h-2.5 w-2.5 animate-spin opacity-70" />
          )}
          {msg.status === "failed" && (
            <span className="text-xs text-red-300">Failed</span>
          )}
        </div>
      </div>
    </div>
  );
});

export function ChatPanel() {
  const {
    messages,
    approvals,
    isRunning,
    connectionStatus,
    historyLoading,
    loadingOlderPage,
    hasOlderPage,
    sendMessage,
    loadOlderPage,
    respondApproval,
    clearChat,
  } = useChat();

  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeight = useRef(0);
  const online = useNetworkStatus();

  // Voice input — transcription populates the text field
  const voice = useVoiceInput({
    onResult: (transcript) => {
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    },
    onError: (err) => {
      toast({ title: "Voice input error", description: err });
    },
  });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Preserve scroll position after loading older page
  useEffect(() => {
    if (!loadingOlderPage && scrollContainerRef.current) {
      const delta = scrollContainerRef.current.scrollHeight - prevScrollHeight.current;
      if (delta > 0) {
        scrollContainerRef.current.scrollTop += delta;
      }
    }
  }, [loadingOlderPage, messages.length]);

  // Scroll-up pagination
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || loadingOlderPage || !hasOlderPage) return;
    if (el.scrollTop < 80) {
      prevScrollHeight.current = el.scrollHeight;
      loadOlderPage();
    }
  }, [loadOlderPage, loadingOlderPage, hasOlderPage]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;

    const opsCommand = parseOpsCommand(text);
    if (opsCommand) {
      setInput("");
      setIsSending(true);
      try {
        const result = await runOpsCommand(opsCommand);
        toast({
          title: `Ops action queued: ${result.action}`,
          description: `requestId ${result.requestId}`,
        });
      } catch (error) {
        toast({
          title: "Ops command failed",
          description: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setIsSending(false);
      }
      return;
    }

    setInput("");
    setIsSending(true);
    try {
      await sendMessage(text);
    } finally {
      setIsSending(false);
    }
  };

  // ---- Connection status label ----
  const statusLabel =
    connectionStatus === "connected"
      ? "Connected"
      : connectionStatus === "reconnecting"
        ? "Reconnecting…"
        : "Disconnected";
  const statusColor =
    connectionStatus === "connected"
      ? "text-green-400"
      : connectionStatus === "reconnecting"
        ? "text-yellow-400"
        : "text-red-400";
  const statusDot =
    connectionStatus === "connected" ? "🟢" : connectionStatus === "reconnecting" ? "🟡" : "🔴";

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div>
          <h2 className="text-lg font-semibold text-white">Chat with Horizon</h2>
          <p className={`text-sm ${statusColor}`}>
            {statusDot} {statusLabel}
          </p>
        </div>
        <button
          onClick={clearChat}
          className="text-slate-400 hover:text-white text-sm px-3 py-1 rounded hover:bg-slate-800"
        >
          Clear
        </button>
      </div>

      {/* Offline banner */}
      {!online && (
        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-900/60 text-yellow-200 text-xs">
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          You are offline — messages will be sent when connectivity is restored.
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {/* Older-page spinner */}
        {loadingOlderPage && (
          <div className="flex justify-center py-2">
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          </div>
        )}

        {historyLoading ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span>Loading history…</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <p>No messages yet. Start chatting with Horizon!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <ChatBubble key={msg.id || msg.clientMessageId} msg={msg} />
          ))
        )}

        {/* Approval cards */}
        {approvals.map((a) => (
          <ApprovalCard key={a.approvalId} approval={a} onRespond={respondApproval} />
        ))}

        {/* Typing / run indicator */}
        {isRunning && (
          <div className="flex justify-start">
            <div className="bg-slate-700 text-slate-300 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Horizon is working…
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="p-4 border-t border-slate-700 space-y-2">
        {/* Interim voice transcript preview */}
        {voice.interim && (
          <p className="text-xs text-slate-400 italic truncate">
            🎙️ {voice.interim}
          </p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isSending}
            placeholder={
              voice.listening
                ? "Listening… speak now"
                : connectionStatus === "disconnected"
                  ? "Disconnected — messages will be sent when reconnected"
                  : "Type a message or use 🎙️ voice (or ops.local/ops.remote)"
            }
            className="flex-1 px-3 py-2 bg-slate-800 text-white border border-slate-700 rounded focus:outline-none focus:border-orange-500 disabled:opacity-50"
          />
          <VoiceButton
            listening={voice.listening}
            supported={voice.supported}
            onClick={voice.toggle}
            disabled={isSending}
          />
          <button
            type="submit"
            disabled={isSending || !input.trim()}
            className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
