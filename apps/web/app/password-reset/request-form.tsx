"use client";

import { type FormEvent, useState } from "react";
import type { PasswordResetRequest } from "@sketchcatch/types";
import { getApiErrorMessage } from "../../lib/api-client";
import { requestPasswordReset } from "../../lib/auth-api";

export function PasswordResetRequestForm() {
  const [debugResetUrl, setDebugResetUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setDebugResetUrl(null);
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData(event.currentTarget);
    const payload: PasswordResetRequest = {
      email: String(formData.get("email") ?? "").trim()
    };

    if (!payload.email) {
      setErrorMessage("가입한 이메일을 입력해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await requestPasswordReset(payload);
      setSuccessMessage("비밀번호 재설정 안내를 보냈습니다. 메일함을 확인해주세요.");
      setDebugResetUrl(response.debugResetUrl ?? null);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "비밀번호 재설정 요청에 실패했습니다."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="authForm" onSubmit={handleSubmit}>
      <label>
        이메일
        <input
          autoComplete="email"
          disabled={isSubmitting}
          name="email"
          placeholder="user@example.com"
          required
          type="email"
        />
      </label>
      {errorMessage ? (
        <p className="authMessage authMessageError" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {successMessage ? (
        <p className="authMessage authMessageSuccess" role="status">
          {successMessage}
        </p>
      ) : null}
      {debugResetUrl ? (
        <p className="authHelpText">
          로컬 개발용 링크: <a href={debugResetUrl}>{debugResetUrl}</a>
        </p>
      ) : null}
      <button aria-busy={isSubmitting} className="authSubmit" disabled={isSubmitting} type="submit">
        {isSubmitting ? "요청 중" : "재설정 링크 받기"}
      </button>
    </form>
  );
}
