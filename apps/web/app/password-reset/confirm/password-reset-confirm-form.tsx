"use client";

import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import {
  getPasswordPolicyErrorMessage,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_HELP_TEXT,
  type PasswordResetConfirmRequest
} from "@sketchcatch/types";
import { confirmPasswordReset } from "../../../lib/auth-api";
import { getApiErrorMessage } from "../../../lib/api-client";

type PasswordResetConfirmFormProps = {
  readonly initialToken: string;
};

export function PasswordResetConfirmForm({ initialToken }: PasswordResetConfirmFormProps) {
  const hasInitialToken = initialToken.trim().length > 0;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPasswordConfirmVisible, setIsPasswordConfirmVisible] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetToken, setResetToken] = useState(initialToken);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("newPassword") ?? "");
    const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
    const payload: PasswordResetConfirmRequest = {
      newPassword: password,
      resetToken: resetToken.trim()
    };

    if (!payload.resetToken) {
      setErrorMessage("비밀번호 재설정 링크가 올바르지 않습니다.");
      return;
    }

    const passwordPolicyError = getPasswordPolicyErrorMessage(password);

    if (passwordPolicyError) {
      setErrorMessage(passwordPolicyError);
      return;
    }

    if (password !== passwordConfirm) {
      setErrorMessage("비밀번호와 비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setIsSubmitting(true);

    try {
      await confirmPasswordReset(payload);
      setSuccessMessage("비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "비밀번호 변경에 실패했습니다."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="authForm" onSubmit={handleSubmit}>
      {hasInitialToken ? (
        <input name="resetToken" readOnly type="hidden" value={resetToken} />
      ) : (
        <label>
          재설정 토큰
          <input
            autoComplete="one-time-code"
            disabled={isSubmitting || Boolean(successMessage)}
            name="resetToken"
            onChange={(event) => setResetToken(event.target.value)}
            required
            type="text"
            value={resetToken}
          />
        </label>
      )}
      <div className="authField">
        <label htmlFor="password-reset-new-password">새 비밀번호</label>
        <div className="authPasswordField">
          <input
            aria-describedby="password-reset-new-password-help"
            autoComplete="new-password"
            disabled={isSubmitting || Boolean(successMessage)}
            id="password-reset-new-password"
            maxLength={PASSWORD_MAX_LENGTH}
            minLength={PASSWORD_MIN_LENGTH}
            name="newPassword"
            placeholder="Password"
            required
            type={isPasswordVisible ? "text" : "password"}
          />
          <button
            aria-label={isPasswordVisible ? "비밀번호 숨기기" : "비밀번호 보기"}
            aria-pressed={isPasswordVisible}
            className="authPasswordToggle"
            disabled={isSubmitting || Boolean(successMessage)}
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
        <span className="authHelpText" id="password-reset-new-password-help">
          {PASSWORD_POLICY_HELP_TEXT}
        </span>
      </div>
      <div className="authField">
        <label htmlFor="password-reset-confirm-password">새 비밀번호 확인</label>
        <div className="authPasswordField">
          <input
            autoComplete="new-password"
            disabled={isSubmitting || Boolean(successMessage)}
            id="password-reset-confirm-password"
            maxLength={PASSWORD_MAX_LENGTH}
            minLength={PASSWORD_MIN_LENGTH}
            name="passwordConfirm"
            placeholder="Password"
            required
            type={isPasswordConfirmVisible ? "text" : "password"}
          />
          <button
            aria-label={isPasswordConfirmVisible ? "비밀번호 확인 숨기기" : "비밀번호 확인 보기"}
            aria-pressed={isPasswordConfirmVisible}
            className="authPasswordToggle"
            disabled={isSubmitting || Boolean(successMessage)}
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
        <p className="authMessage authMessageError" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {successMessage ? (
        <p className="authMessage authMessageSuccess" role="status">
          {successMessage} <Link href="/login">로그인</Link>
        </p>
      ) : null}
      <button
        aria-busy={isSubmitting}
        className="authSubmit"
        disabled={isSubmitting || Boolean(successMessage)}
        type="submit"
      >
        {isSubmitting ? "변경 중" : "비밀번호 변경"}
      </button>
    </form>
  );
}
