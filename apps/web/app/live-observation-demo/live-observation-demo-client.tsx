"use client";

import { useMemo, useState } from "react";
import styles from "./live-observation-demo.module.css";

type SendState = "idle" | "sending" | "success" | "error";

export function LiveObservationDemoClient() {
  const [sendState, setSendState] = useState<SendState>("idle");
  const [successCount, setSuccessCount] = useState(0);
  const [message, setMessage] = useState("버튼을 누르면 데모 서비스로 실제 traffic 요청을 보냅니다.");

  const config = useMemo(() => {
    if (typeof window === "undefined") {
      return { collector: "", observation: "", trafficUrl: "" };
    }

    const params = new URLSearchParams(window.location.search);
    const collector = normalizeUrl(params.get("collector"));
    const trafficUrl = normalizeUrl(params.get("traffic")) || (collector ? `${collector}/api/traffic` : "");

    return {
      collector,
      observation: params.get("observation") ?? "",
      trafficUrl
    };
  }, []);

  const ready = Boolean(config.collector && config.observation && config.trafficUrl);

  async function sendTraffic() {
    if (!ready) {
      setSendState("error");
      setMessage("Live Observation QR URL에 observation 또는 collector 정보가 없습니다.");
      return;
    }

    setSendState("sending");
    setMessage("데모 Traffic API로 요청을 보내는 중입니다.");

    try {
      const trafficResponse = await fetch(config.trafficUrl, { method: "POST" });
      if (!trafficResponse.ok) {
        throw new Error("Traffic API가 요청을 처리하지 못했습니다.");
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
        throw new Error("Traffic 요청은 성공했지만 Live Observation 집계에 실패했습니다.");
      }

      setSuccessCount((count) => count + 1);
      setSendState("success");
      setMessage("요청이 성공했고 Live Observation에 반영되었습니다.");
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
          이 화면은 QR로 들어온 브라우저에서 데모 서비스에 traffic을 만들고, 성공한 요청만
          관측 화면으로 집계합니다.
        </p>
        <button
          className={styles.button}
          disabled={sendState === "sending"}
          onClick={() => void sendTraffic()}
          type="button"
        >
          {sendState === "sending" ? "보내는 중" : "트래픽 1건 보내기"}
        </button>
        <p className={`${styles.status} ${styles[sendState]}`} role="status" aria-live="polite">
          {message}
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
