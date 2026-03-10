import React from "react";
import { Mic, MicOff } from "lucide-react";

interface VoiceButtonProps {
  listening: boolean;
  supported: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export const VoiceButton = React.memo(function VoiceButton({
  listening,
  supported,
  onClick,
  disabled = false,
}: VoiceButtonProps) {
  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={listening ? "Stop voice input" : "Start voice input"}
      title={listening ? "Stop listening" : "Voice input"}
      className={`p-2 rounded transition-colors ${
        listening
          ? "bg-red-500 text-white animate-pulse hover:bg-red-600"
          : "bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white"
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </button>
  );
});
