"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import type { SignupRequest } from "@sketchcatch/types";
import { useAuth } from "../../components/auth/auth-provider";
import { getApiErrorMessage } from "../../lib/api-client";

export function SignupForm() {
  const router = useRouter();
  const { signup, status } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/mypage");
    }
  }, [router, status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
    const payload: SignupRequest = {
      email: String(formData.get("email") ?? "").trim(),
      nickname: String(formData.get("nickname") ?? "").trim(),
      password,
      username: String(formData.get("username") ?? "").trim()
    };

    if (!payload.username || !payload.nickname || !payload.email || !payload.password) {
      setErrorMessage("회원가입 정보를 모두 입력해주세요.");
      return;
    }

    if (password !== passwordConfirm) {
      setErrorMessage("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setIsSubmitting(true);

    try {
      await signup(payload);
      router.replace("/mypage");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "회원가입에 실패했습니다."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="authForm authFormGrid" onSubmit={handleSubmit}>
      <label>
        아이디
        <input
          autoComplete="username"
          disabled={isSubmitting}
          minLength={3}
          name="username"
          placeholder="아이디를 입력하세요."
          required
          type="text"
        />
      </label>
      <label>
        이름
        <input
          autoComplete="nickname"
          disabled={isSubmitting}
          name="nickname"
          required
          type="text"
        />
      </label>
      <label className="fullField">
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
      <label>
        비밀번호
        <input
          autoComplete="new-password"
          disabled={isSubmitting}
          minLength={8}
          name="password"
          placeholder="Password"
          required
          type="password"
        />
      </label>
      <label>
        비밀번호 확인
        <input
          autoComplete="new-password"
          disabled={isSubmitting}
          minLength={8}
          name="passwordConfirm"
          placeholder="Password"
          required
          type="password"
        />
      </label>
      {errorMessage ? (
        <p className="authMessage authMessageError fullField" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <button
        aria-busy={isSubmitting}
        className="authSubmit fullField"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "가입 중" : "회원가입"}
      </button>
    </form>
  );
}
