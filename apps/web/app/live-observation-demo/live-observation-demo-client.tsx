"use client";

import { useMemo, useState } from "react";
import styles from "./live-observation-demo.module.css";

type SendState = "idle" | "sending" | "success" | "error";

export function LiveObservationDemoClient() {
  const [sendState, setSendState] = useState<SendState>("idle");
  const [successCount, setSuccessCount] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const config = useMemo(() => {
    if (typeof window === "undefined") {
      return { collector: "", observation: "", trafficUrl: "" };
    }

    const params = new URLSearchParams(window.location.search);
    const collector = normalizeUrl(params.get("collector"));
    const trafficUrl = normalizeUrl(params.get("traffic"));

    return {
      collector,
      observation: params.get("observation") ?? "",
      trafficUrl
    };
  }, []);

  const ready = Boolean(config.collector && config.observation);
  const isSimulation = !config.trafficUrl;
  const statusMessage = message ?? (isSimulation
    ? "실제 Traffic API가 없어 Live Observation 이벤트만 시뮬레이션합니다."
    : "버튼을 누르면 데모 서비스로 실제 traffic 요청을 보냅니다.");

  async function sendTraffic() {
    if (!ready) {
      setSendState("error");
      setMessage("Live Observation QR URL에 observation 또는 collector 정보가 없습니다.");
      return;
    }

    setSendState("sending");
    setMessage(isSimulation
      ? "Live Observation 이벤트를 시뮬레이션하는 중입니다."
      : "데모 Traffic API로 요청을 보내는 중입니다.");

    try {
      if (config.trafficUrl) {
        const trafficResponse = await fetch(config.trafficUrl, { method: "POST" });
        if (!trafficResponse.ok) {
          throw new Error("Traffic API가 요청을 처리하지 못했습니다.");
        }
      }

      const receiptResponse = await fetch(
        `${config.collector}/api/live-observations/public/${encodeURIComponent(config.observation)}/events`,
        {
          body: JSON.stringify({ eventId: crypto.randomUUID() }),
          headers: { "Content-Type": "application/json" },
          method: "POST"
        }
      );
      if (!receiptResponse.ok) {
        throw new Error(isSimulation
          ? "Live Observation 이벤트 시뮬레이션에 실패했습니다."
          : "Traffic 요청은 성공했지만 Live Observation 집계에 실패했습니다.");
      }

      setSuccessCount((count) => count + 1);
      setSendState("success");
      setMessage(isSimulation
        ? "시뮬레이션 이벤트가 Live Observation에 반영되었습니다."
        : "요청이 성공했고 Live Observation에 반영되었습니다.");
    } catch (error) {
      setSendState("error");
      setMessage(error instanceof Error ? error.message : "요청에 실패했습니다.");
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <p className={styles.kicker}>SketchCatch Live Observation</p>
        <h1>관객 트래픽 보내기</h1>
        <p className={styles.copy}>
          {isSimulation
            ? "이 링크에는 실제 Traffic API가 없어 관측 이벤트를 시뮬레이션합니다."
            : "이 화면은 데모 서비스에 실제 traffic을 만들고, 성공한 요청만 관측 화면으로 집계합니다."}
        </p>
        <button
          className={styles.button}
          disabled={sendState === "sending"}
          onClick={() => void sendTraffic()}
          type="button"
        >
          {sendState === "sending"
            ? "보내는 중"
            : isSimulation ? "이벤트 1건 시뮬레이션" : "트래픽 1건 보내기"}
        </button>
        <p className={`${styles.status} ${styles[sendState]}`} role="status" aria-live="polite">
          {statusMessage}
        </p>
        <dl className={styles.metrics}>
          <div>
            <dt>이 브라우저 성공</dt>
            <dd>{successCount}건</dd>
          </div>
          <div>
            <dt>Collector</dt>
            <dd>{config.collector || "없음"}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}

function normalizeUrl(value: string | null): string {
  return value?.replace(/\/+$/, "") ?? "";
}
