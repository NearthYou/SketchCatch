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
    const oauthError = new URLSearchParams(window.location.search).get("oauthError");

    if (oauthError) {
      setErrorMessage(getOAuthErrorMessage(oauthError));
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/mypage");
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
      router.replace("/mypage");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "로그인에 실패했습니다."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="authForm" onSubmit={handleSubmit}>
      <div className="authSocialStack" aria-label="소셜 로그인">
        <a className="authSocialButton authSocialButtonNaver" href="/api/auth/oauth/naver/start">
          <span className="authSocialMark" aria-hidden="true">
            N
          </span>
          <span>Naver로 계속하기</span>
        </a>
        <a className="authSocialButton authSocialButtonKakao" href="/api/auth/oauth/kakao/start">
          <span className="authSocialMark authSocialMarkKakao" aria-hidden="true">
            K
          </span>
          <span>Kakao로 계속하기</span>
        </a>
        <a className="authSocialButton authSocialButtonGithub" href="/api/auth/oauth/github/start">
          <span className="authSocialMark authSocialMarkGithub" aria-hidden="true">
            G
          </span>
          <span>GitHub로 계속하기</span>
        </a>
      </div>
      <div className="authDivider" aria-hidden="true">
        <span>또는</span>
      </div>
      <label>
        아이디
        <input
          autoComplete="username"
          disabled={isSubmitting}
          name="username"
          placeholder="ID"
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

function getOAuthErrorMessage(oauthError: string): string {
  switch (oauthError) {
    case "email_required":
      return "소셜 계정에서 이메일 제공에 동의해야 로그인할 수 있습니다.";
    case "email_already_registered":
      return "이미 가입된 이메일입니다. 기존 계정으로 로그인한 뒤 계정 연결이 필요합니다.";
    case "invalid_callback":
      return "소셜 로그인 요청 정보가 올바르지 않습니다. 다시 시도해주세요.";
    case "rate_limited":
      return "소셜 로그인 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
    case "profile_fetch_failed":
      return "소셜 계정 프로필 정보를 불러오지 못했습니다. 다시 시도해주세요.";
    case "provider_error":
      return "소셜 로그인이 취소되었거나 승인되지 않았습니다.";
    case "session_failed":
      return "로그인 세션을 만들지 못했습니다. 다시 시도해주세요.";
    case "state_mismatch":
      return "소셜 로그인 요청이 만료되었습니다. 다시 시도해주세요.";
    case "token_exchange_failed":
      return "소셜 로그인 인증 정보를 확인하지 못했습니다. 다시 시도해주세요.";
    case "user_deleted":
      return "탈퇴 처리된 계정은 로그인할 수 없습니다.";
    case "user_link_failed":
      return "소셜 계정을 SketchCatch 계정과 연결하지 못했습니다.";
    default:
      return "소셜 로그인에 실패했습니다. 다시 시도해주세요.";
  }
}
