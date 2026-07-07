"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_VOICE_LANGUAGE = "ko-KR";
const DEFAULT_NO_SPEECH_TIMEOUT_MS = 8000;
const LISTENING_STATUS_MESSAGE = "음성 인식 중입니다.";

type BrowserSpeechRecognitionAlternative = {
  readonly transcript: string;
};

type BrowserSpeechRecognitionResult = {
  readonly [index: number]: BrowserSpeechRecognitionAlternative | undefined;
};

type BrowserSpeechRecognitionEvent = {
  readonly results: {
    readonly length: number;
    readonly [index: number]: BrowserSpeechRecognitionResult | undefined;
  };
};

type BrowserSpeechRecognitionErrorEvent = {
  readonly error: string;
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onspeechstart: (() => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechRecognitionWindow = Window & {
  readonly SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  readonly webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
};

type UseBrowserVoiceInputOptions = {
  readonly language?: string | undefined;
  readonly noSpeechTimeoutMs?: number | undefined;
  readonly onChange: (value: string) => void;
  readonly value: string;
};

type BrowserVoiceInputState = {
  readonly isListening: boolean;
  readonly isSupported: boolean;
  readonly start: () => void;
  readonly statusMessage: string;
  readonly stop: () => void;
  readonly toggle: () => void;
};

export function useBrowserVoiceInput({
  language = DEFAULT_VOICE_LANGUAGE,
  noSpeechTimeoutMs = DEFAULT_NO_SPEECH_TIMEOUT_MS,
  onChange,
  value
}: UseBrowserVoiceInputOptions): BrowserVoiceInputState {
  const [isListening, setListening] = useState(false);
  const [isSupported, setSupported] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const voiceInputBaseRef = useRef("");
  const voiceNoSpeechTimerRef = useRef<number | null>(null);

  const clearNoSpeechTimer = useCallback(() => {
    if (voiceNoSpeechTimerRef.current === null) {
      return;
    }

    window.clearTimeout(voiceNoSpeechTimerRef.current);
    voiceNoSpeechTimerRef.current = null;
  }, []);

  const releaseRecognition = useCallback(
    (action: "abort" | "stop") => {
      const recognition = speechRecognitionRef.current;

      if (recognition === null) {
        return;
      }

      clearSpeechRecognitionHandlers(recognition);
      recognition[action]();
      speechRecognitionRef.current = null;
    },
    []
  );

  const stop = useCallback(() => {
    clearNoSpeechTimer();
    releaseRecognition("stop");
    setListening(false);
    setStatusMessage("");
  }, [clearNoSpeechTimer, releaseRecognition]);

  const start = useCallback(() => {
    const SpeechRecognitionConstructor = getBrowserSpeechRecognitionConstructor();

    if (SpeechRecognitionConstructor === undefined) {
      setSupported(false);
      setStatusMessage("이 브라우저는 음성 인식을 지원하지 않습니다.");
      return;
    }

    if (!window.isSecureContext) {
      setStatusMessage("음성 인식은 HTTPS 또는 localhost 주소에서만 사용할 수 있습니다.");
      return;
    }

    clearNoSpeechTimer();
    releaseRecognition("abort");

    const recognition = new SpeechRecognitionConstructor();
    voiceInputBaseRef.current = value;
    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      clearNoSpeechTimer();
      const transcript = getSpeechRecognitionTranscript(event);

      if (transcript.length > 0) {
        onChange(mergeVoiceTranscript(voiceInputBaseRef.current, transcript));
      }
    };
    recognition.onspeechstart = () => {
      clearNoSpeechTimer();
    };
    recognition.onerror = (event) => {
      clearNoSpeechTimer();
      setListening(false);
      speechRecognitionRef.current = null;
      setStatusMessage(getVoiceRecognitionErrorMessage(event.error));
    };
    recognition.onend = () => {
      clearNoSpeechTimer();
      setListening(false);
      speechRecognitionRef.current = null;
      setStatusMessage((currentMessage) =>
        currentMessage === LISTENING_STATUS_MESSAGE ? "" : currentMessage
      );
    };

    try {
      speechRecognitionRef.current = recognition;
      setListening(true);
      setStatusMessage(LISTENING_STATUS_MESSAGE);
      recognition.start();
      voiceNoSpeechTimerRef.current = window.setTimeout(() => {
        releaseRecognition("abort");
        setListening(false);
        setStatusMessage("8초 동안 음성이 들리지 않아 음성 인식을 중지했습니다.");
      }, noSpeechTimeoutMs);
    } catch {
      speechRecognitionRef.current = null;
      setListening(false);
      setStatusMessage("음성 인식을 시작하지 못했습니다.");
    }
  }, [
    clearNoSpeechTimer,
    language,
    noSpeechTimeoutMs,
    onChange,
    releaseRecognition,
    value
  ]);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
      return;
    }

    start();
  }, [isListening, start, stop]);

  useEffect(() => {
    setSupported(getBrowserSpeechRecognitionConstructor() !== undefined);

    return () => {
      clearNoSpeechTimer();
      releaseRecognition("abort");
    };
  }, [clearNoSpeechTimer, releaseRecognition]);

  return {
    isListening,
    isSupported,
    start,
    statusMessage,
    stop,
    toggle
  };
}

function getBrowserSpeechRecognitionConstructor(): BrowserSpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const speechWindow = window as SpeechRecognitionWindow;

  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function clearSpeechRecognitionHandlers(recognition: BrowserSpeechRecognition): void {
  recognition.onend = null;
  recognition.onerror = null;
  recognition.onresult = null;
  recognition.onspeechstart = null;
}

function getSpeechRecognitionTranscript(event: BrowserSpeechRecognitionEvent): string {
  const transcriptParts: string[] = [];

  for (let resultIndex = 0; resultIndex < event.results.length; resultIndex += 1) {
    const result = event.results[resultIndex];
    const transcript = result?.[0]?.transcript.trim();

    if (transcript) {
      transcriptParts.push(transcript);
    }
  }

  return transcriptParts.join(" ").trim();
}

function mergeVoiceTranscript(baseValue: string, transcript: string): string {
  const trimmedBaseValue = baseValue.trim();

  if (trimmedBaseValue.length === 0) {
    return transcript;
  }

  return `${trimmedBaseValue} ${transcript}`;
}

function getVoiceRecognitionErrorMessage(error: string): string {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "마이크 권한을 허용해야 음성 인식을 사용할 수 있습니다.";
  }

  if (error === "network") {
    return "브라우저 음성 인식 서비스에 연결하지 못했습니다. Chrome에서 localhost/HTTPS로 열고 인터넷 연결을 확인해주세요.";
  }

  if (error === "audio-capture") {
    return "마이크 장치를 찾지 못했습니다. OS와 브라우저의 마이크 입력 장치를 확인해주세요.";
  }

  if (error === "language-not-supported") {
    return "현재 브라우저가 한국어 음성 인식을 지원하지 않습니다.";
  }

  if (error === "no-speech") {
    return "음성이 감지되지 않았습니다. 다시 눌러 말해주세요.";
  }

  if (error === "aborted") {
    return "음성 인식이 취소되었습니다.";
  }

  return `음성 인식 중 오류가 발생했습니다. (${error})`;
}
