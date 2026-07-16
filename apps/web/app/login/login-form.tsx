"use client";

import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useState
} from "react";
import type { LoginRequest } from "@sketchcatch/types";
import { useAuth } from "../../components/auth/auth-provider";
import { ProductState } from "../../components/ui/ProductState";
import { getCapsLockWarningMessage, isCapsLockActive } from "../../features/auth/caps-lock";
import { getSafeReturnPath } from "../../features/auth/return-path";
import { getApiErrorMessage } from "../../lib/api-client";

// 일반 로그인과 소셜 로그인 상태를 한 form 안에서 안전하게 연결합니다.
export function LoginForm() {
  const router = useRouter();
  const { login, status } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasswordCapsLockOn, setIsPasswordCapsLockOn] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [returnPath, setReturnPath] = useState("/dashboard");
  const passwordCapsLockWarning = getCapsLockWarningMessage(isPasswordCapsLockOn);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const oauthError = searchParams.get("oauthError");
    setReturnPath(getSafeReturnPath(searchParams.get("returnTo")));

    if (status === "authenticated") {
      router.replace(getSafeReturnPath(searchParams.get("returnTo")));
      return;
    }

    if (oauthError) {
      setErrorMessage(getOAuthErrorMessage(oauthError));
    }
  }, [router, status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);

    const formData = new FormData(event.currentTarget);
    const payload: LoginRequest = {
      password: String(formData.get("password") ?? ""),
      rememberMe,
      username: String(formData.get("username") ?? "").trim()
    };

    if (!payload.username || !payload.password) {
      setErrorMessage("아이디와 비밀번호를 입력해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      await login(payload);
      const searchParams = new URLSearchParams(window.location.search);
      const returnPath = getSafeReturnPath(searchParams.get("returnTo"));
      router.replace(returnPath);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "로그인에 실패했습니다."));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handlePasswordKeyEvent(event: ReactKeyboardEvent<HTMLInputElement>): void {
    setIsPasswordCapsLockOn(isCapsLockActive(event));
  }

  if (status !== "unauthenticated") {
    return (
      <ProductState
        compact
        description={
          status === "loading"
            ? "저장된 로그인 정보를 확인하고 있습니다."
            : "로그인이 확인되어 Dashboard로 이동합니다."
        }
        kind={status === "loading" ? "loading" : "waiting"}
        title={status === "loading" ? "세션 확인 중" : "이동 중"}
      />
    );
  }

  return (
    <form className="authForm" onSubmit={handleSubmit}>
      <div className="authSocialStack" aria-label="소셜 로그인">
        <a
          className="authSocialButton authSocialButtonNaver"
          href={getOAuthStartHref("naver", rememberMe, returnPath)}
        >
          <span className="authSocialMark" aria-hidden="true">
            N
          </span>
          <span>Naver로 계속하기</span>
        </a>
        <a
          className="authSocialButton authSocialButtonKakao"
          href={getOAuthStartHref("kakao", rememberMe, returnPath)}
        >
          <span className="authSocialMark authSocialMarkKakao" aria-hidden="true">
            K
          </span>
          <span>Kakao로 계속하기</span>
        </a>
        <a
          className="authSocialButton authSocialButtonGithub"
          href={getOAuthStartHref("github", rememberMe, returnPath)}
        >
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
      <div className="authField">
        <label htmlFor="login-password">비밀번호</label>
        <div className="authPasswordField">
          <input
            aria-describedby={passwordCapsLockWarning ? "login-password-caps-lock" : undefined}
            autoComplete="current-password"
            disabled={isSubmitting}
            id="login-password"
            name="password"
            onBlur={() => setIsPasswordCapsLockOn(false)}
            onKeyDown={handlePasswordKeyEvent}
            onKeyUp={handlePasswordKeyEvent}
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
        {passwordCapsLockWarning ? (
          <span className="authHelpText authWarningText" id="login-password-caps-lock" role="alert">
            {passwordCapsLockWarning}
          </span>
        ) : null}
      </div>
      <label className="authCheckboxLabel">
        <input
          checked={rememberMe}
          disabled={isSubmitting}
          name="rememberMe"
          onChange={(event) => setRememberMe(event.target.checked)}
          type="checkbox"
        />
        <span>로그인 상태 유지</span>
      </label>
      <div className="authFormActions">
        <Link href="/password-reset">비밀번호를 잊으셨나요?</Link>
      </div>
      {errorMessage ? (
        <ProductState
          action={
            <Link className="authInlineAction" href="/dashboard">
              Dashboard
            </Link>
          }
          compact
          description={errorMessage}
          kind="error"
          title="로그인하지 못했습니다"
        />
      ) : null}
      <button aria-busy={isSubmitting} className="authSubmit" disabled={isSubmitting} type="submit">
        {isSubmitting ? "로그인 중" : "로그인"}
      </button>
    </form>
  );
}

// 소셜 로그인 시작 주소에 로그인 전 내부 route와 유지 여부를 함께 담습니다.
function getOAuthStartHref(
  provider: "naver" | "kakao" | "github",
  rememberMe: boolean,
  returnTo: string
): string {
  return `/api/auth/oauth/${provider}/start?${new URLSearchParams({
    ...(rememberMe ? { rememberMe: "true" } : {}),
    returnTo
  }).toString()}`;
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
