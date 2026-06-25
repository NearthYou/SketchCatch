"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import type { LoginRequest } from "@sketchcatch/types";
import { useAuth } from "../../components/auth/auth-provider";
import { getApiErrorMessage } from "../../lib/api-client";

export function LoginForm() {
  const router = useRouter();
  const { login, status } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/workspace");
    }
  }, [router, status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);

    const formData = new FormData(event.currentTarget);
    const payload: LoginRequest = {
      password: String(formData.get("password") ?? ""),
      username: String(formData.get("username") ?? "").trim()
    };

    if (!payload.username || !payload.password) {
      setErrorMessage("아이디와 비밀번호를 입력해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      await login(payload);
      router.replace("/workspace");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "로그인에 실패했습니다."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="authForm" onSubmit={handleSubmit}>
      <label>
        아이디
        <input
          autoComplete="username"
          disabled={isSubmitting}
          name="username"
          placeholder="yoonseo"
          required
          type="text"
        />
      </label>
      <label>
        비밀번호
        <input
          autoComplete="current-password"
          disabled={isSubmitting}
          name="password"
          placeholder="Password"
          required
          type="password"
        />
      </label>
      {errorMessage ? (
        <p className="authMessage authMessageError" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <button aria-busy={isSubmitting} className="authSubmit" disabled={isSubmitting} type="submit">
        {isSubmitting ? "로그인 중" : "로그인"}
      </button>
    </form>
  );
}
