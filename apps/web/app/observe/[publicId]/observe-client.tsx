"use client";

import { useEffect, useRef, useState } from "react";
import { createLiveObservationAudienceClient } from "../../../features/live-observation/live-observation-audience-client";
import {
  createLiveObservationAudienceSession,
  initialLiveObservationAudienceState,
  type LiveObservationAudiencePageState
} from "../../../features/live-observation/live-observation-audience-session";
import styles from "./observe.module.css";

export function ObserveClient({ publicId }: { readonly publicId: string }) {
  const [viewState, setViewState] = useState(initialLiveObservationAudienceState);
  const sessionRef = useRef<ReturnType<typeof createLiveObservationAudienceSession> | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = createLiveObservationAudienceSession({
      createClient: createLiveObservationAudienceClient,
      onState: setViewState
    });
  }
  const session = sessionRef.current;

  useEffect(() => session.activate(publicId), [publicId, session]);

  function runPrimaryAction(): void {
    if (viewState.bootstrapReady) {
      void session.request();
    } else {
      session.reconnect();
    }
  }

  const isBusy = viewState.pageState === "connecting" || viewState.pageState === "sending";
  const canRunPrimaryAction = !isBusy && viewState.pageState !== "expired";

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <p className={styles.kicker}>SketchCatch Live Observation</p>
        <h1>서비스 요청 보내기</h1>
        <p className={styles.copy}>버튼을 누르면 검증된 서비스로 요청 한 건을 안전하게 전달합니다.</p>
        <button
          className={styles.button}
          disabled={!canRunPrimaryAction}
          onClick={runPrimaryAction}
          type="button"
        >
          {getPrimaryActionLabel(viewState.pageState, viewState.bootstrapReady)}
        </button>
        <p
          className={styles.status}
          data-state={viewState.pageState}
          role="status"
          aria-live="polite"
        >
          {getStatusMessage(
            viewState.pageState,
            viewState.successCount,
            viewState.bootstrapReady
          )}
        </p>
      </section>
    </main>
  );
}

function getPrimaryActionLabel(
  pageState: LiveObservationAudiencePageState,
  bootstrapReady: boolean
): string {
  if (pageState === "connecting") return "연결 중";
  if (pageState === "sending") return "전송 중";
  if (!bootstrapReady) return "다시 연결";
  if (pageState === "rate_limited" || pageState === "error") return "다시 요청";
  return "요청 보내기";
}

function getStatusMessage(
  state: LiveObservationAudiencePageState,
  successCount: number,
  bootstrapReady: boolean
): string {
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
      return bootstrapReady
        ? "요청 한도에 도달했습니다. 다시 요청할 수 있습니다."
        : "연결 요청 한도에 도달했습니다. 다시 연결할 수 있습니다.";
    case "error":
      return bootstrapReady
        ? "요청을 전달하지 못했습니다. 다시 요청해주세요."
        : "관측 세션에 연결하지 못했습니다. 다시 연결해주세요.";
  }
}
