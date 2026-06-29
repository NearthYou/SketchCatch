"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import type { SignupRequest } from "@sketchcatch/types";
import { useAuth } from "../../components/auth/auth-provider";
import { getApiErrorMessage } from "../../lib/api-client";

export function SignupForm() {
  const router = useRouter();
  const { signup, status } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPasswordConfirmVisible, setIsPasswordConfirmVisible] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
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
      setErrorMessage("비밀번호와 비밀번호 확인이 일치하지 않습니다.");
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
      <div className="authField">
        <label htmlFor="signup-password">비밀번호</label>
        <div className="authPasswordField">
          <input
            aria-describedby="signup-password-help"
            autoComplete="new-password"
            disabled={isSubmitting}
            id="signup-password"
            minLength={8}
            name="password"
            placeholder="Password"
            required
            type={isPasswordVisible ? "text" : "password"}
          />
          <button
            aria-label={isPasswordVisible ? "비밀번호 숨기기" : "비밀번호 보기"}
            aria-pressed={isPasswordVisible}
            className="authPasswordToggle"
            disabled={isSubmitting}
            onClick={() => setIsPasswordVisible((current) => !current)}
            title={isPasswordVisible ? "비밀번호 숨기기" : "비밀번호 보기"}
            type="button"
          >
            {isPasswordVisible ? (
              <EyeOff aria-hidden="true" size={18} />
            ) : (
              <Eye aria-hidden="true" size={18} />
            )}
          </button>
        </div>
        <span className="authHelpText" id="signup-password-help">
          8자 이상 입력해주세요.
        </span>
      </div>
      <div className="authField">
        <label htmlFor="signup-password-confirm">비밀번호 확인</label>
        <div className="authPasswordField">
          <input
            autoComplete="new-password"
            disabled={isSubmitting}
            id="signup-password-confirm"
            minLength={8}
            name="passwordConfirm"
            placeholder="Password"
            required
            type={isPasswordConfirmVisible ? "text" : "password"}
          />
          <button
            aria-label={isPasswordConfirmVisible ? "비밀번호 확인 숨기기" : "비밀번호 확인 보기"}
            aria-pressed={isPasswordConfirmVisible}
            className="authPasswordToggle"
            disabled={isSubmitting}
            onClick={() => setIsPasswordConfirmVisible((current) => !current)}
            title={isPasswordConfirmVisible ? "비밀번호 확인 숨기기" : "비밀번호 확인 보기"}
            type="button"
          >
            {isPasswordConfirmVisible ? (
              <EyeOff aria-hidden="true" size={18} />
            ) : (
              <Eye aria-hidden="true" size={18} />
            )}
          </button>
        </div>
      </div>
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
