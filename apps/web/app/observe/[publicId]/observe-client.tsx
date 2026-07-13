"use client";

import { useEffect, useRef, useState } from "react";
import {
  createLiveObservationAudienceClient,
  LiveObservationAudienceError
} from "../../../features/live-observation/live-observation-audience-client";
import styles from "./observe.module.css";

type PageState =
  | "connecting"
  | "ready"
  | "sending"
  | "success"
  | "error"
  | "expired"
  | "rate_limited";

export function ObserveClient({ publicId }: { readonly publicId: string }) {
  const clientRef = useRef<ReturnType<typeof createLiveObservationAudienceClient> | null>(null);
  const activeRef = useRef(false);
  const [pageState, setPageState] = useState<PageState>("connecting");
  const [successCount, setSuccessCount] = useState(0);

  useEffect(() => {
    const client = createLiveObservationAudienceClient(publicId);
    activeRef.current = true;
    clientRef.current = client;
    void client.bootstrap().then(
      () => {
        if (activeRef.current) setPageState("ready");
      },
      (error: unknown) => {
        if (activeRef.current) setPageState(toPageState(error));
      }
    );
    return () => {
      activeRef.current = false;
      client.dispose();
    };
  }, [publicId]);

  async function sendRequest(): Promise<void> {
    const client = clientRef.current;
    if (!client || pageState === "sending") return;
    setPageState("sending");
    try {
      await client.request();
      if (!activeRef.current) return;
      setSuccessCount((count) => count + 1);
      setPageState("success");
    } catch (error) {
      if (activeRef.current) setPageState(toPageState(error));
    }
  }

  const canRequest = pageState === "ready" || pageState === "success" || pageState === "error";

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <p className={styles.kicker}>SketchCatch Live Observation</p>
        <h1>서비스 요청 보내기</h1>
        <p className={styles.copy}>버튼을 누르면 검증된 서비스로 요청 한 건을 안전하게 전달합니다.</p>
        <button
          className={styles.button}
          disabled={!canRequest}
          onClick={() => void sendRequest()}
          type="button"
        >
          {pageState === "sending" ? "전송 중" : "요청 보내기"}
        </button>
        <p className={styles.status} data-state={pageState} role="status" aria-live="polite">
          {getStatusMessage(pageState, successCount)}
        </p>
      </section>
    </main>
  );
}

function toPageState(error: unknown): Extract<PageState, "error" | "expired" | "rate_limited"> {
  if (error instanceof LiveObservationAudienceError) {
    if (error.kind === "expired") return "expired";
    if (error.kind === "rate_limited") return "rate_limited";
  }
  return "error";
}

function getStatusMessage(state: PageState, successCount: number): string {
  switch (state) {
    case "connecting":
      return "관측 세션을 확인하고 있습니다.";
    case "ready":
      return "요청을 보낼 준비가 되었습니다.";
    case "sending":
      return "요청을 전달하고 있습니다.";
    case "success":
      return `요청이 전달되었습니다. 이 브라우저에서 ${successCount}건 성공했습니다.`;
    case "expired":
      return "관측 세션이 종료되었거나 만료되었습니다.";
    case "rate_limited":
      return "요청 한도에 도달했습니다. 잠시 후 다시 시도해주세요.";
    case "error":
      return "요청을 전달하지 못했습니다. 잠시 후 다시 시도해주세요.";
  }
}
