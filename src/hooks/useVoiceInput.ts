import { useState, useRef, useCallback, useEffect } from "react";

// Web Speech API types (vendor-prefixed support)
type SpeechRecognitionInstance = InstanceType<typeof SpeechRecognition>;

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseVoiceInputOptions {
  /** BCP-47 language tag, defaults to "en-US" */
  lang?: string;
  /** Automatically submit the transcript (call onResult) as soon as speech ends */
  autoSend?: boolean;
  /** Called with the final transcript text */
  onResult?: (transcript: string) => void;
  /** Called with interim (not-yet-final) transcript */
  onInterim?: (transcript: string) => void;
  /** Called when an error occurs */
  onError?: (error: string) => void;
}

export interface UseVoiceInputReturn {
  /** Whether the browser supports the Web Speech API */
  supported: boolean;
  /** Whether the microphone is currently listening */
  listening: boolean;
  /** Current interim transcript while speech is being recognized */
  interim: string;
  /** Start listening */
  start: () => void;
  /** Stop listening */
  stop: () => void;
  /** Toggle listening on/off */
  toggle: () => void;
}

/**
 * Custom hook wrapping the Web Speech API for voice input.
 * Falls back gracefully on unsupported browsers (supported=false).
 */
export function useVoiceInput(opts: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const { lang = "en-US", autoSend = false, onResult, onInterim, onError } = opts;

  const [supported] = useState(() => getSpeechRecognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  // Ref so callbacks always see latest options without restarting recognition
  const callbacksRef = useRef({ onResult, onInterim, onError, autoSend });
  callbacksRef.current = { onResult, onInterim, onError, autoSend };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      callbacksRef.current.onError?.("Speech recognition is not supported in this browser.");
      return;
    }

    // Abort any existing instance
    recognitionRef.current?.abort();

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setListening(true);
      setInterim("");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      if (interimTranscript) {
        setInterim(interimTranscript);
        callbacksRef.current.onInterim?.(interimTranscript);
      }

      if (finalTranscript) {
        setInterim("");
        callbacksRef.current.onResult?.(finalTranscript.trim());
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // "aborted" fires when we manually stop — not a real error
      if (event.error !== "aborted") {
        callbacksRef.current.onError?.(event.error);
      }
      setListening(false);
      setInterim("");
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognition.start();
  }, [lang]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (listening) {
      stop();
    } else {
      start();
    }
  }, [listening, start, stop]);

  return { supported, listening, interim, start, stop, toggle };
}
