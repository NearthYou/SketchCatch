"use client";

import { Eye, EyeOff, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import {
  getPasswordPolicyErrorMessage,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_HELP_TEXT,
  type SignupRequest
} from "@sketchcatch/types";
import { useAuth } from "../../components/auth/auth-provider";
import { getApiErrorMessage } from "../../lib/api-client";
import { requestSignupAvailability } from "../../lib/auth-api";

const USERNAME_PATTERN = /^[A-Za-z0-9_-]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AvailabilityStatus = "idle" | "checking" | "available" | "duplicate" | "error";

type AvailabilityState = {
  status: AvailabilityStatus;
  value: string | null;
  message: string | null;
};

const INITIAL_AVAILABILITY_STATE: AvailabilityState = {
  status: "idle",
  value: null,
  message: null
};

export function SignupForm() {
  const router = useRouter();
  const { signup, status } = useAuth();
  const [email, setEmail] = useState("");
  const [emailAvailability, setEmailAvailability] = useState<AvailabilityState>(
    INITIAL_AVAILABILITY_STATE
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPasswordConfirmVisible, setIsPasswordConfirmVisible] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [username, setUsername] = useState("");
  const [usernameAvailability, setUsernameAvailability] = useState<AvailabilityState>(
    INITIAL_AVAILABILITY_STATE
  );

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/mypage");
    }
  }, [router, status]);

  async function handleUsernameAvailabilityCheck(): Promise<void> {
    const normalizedUsername = normalizeUsername(username);

    if (!normalizedUsername) {
      setUsernameAvailability({
        status: "error",
        value: null,
        message: "아이디를 입력해주세요."
      });
      return;
    }

    if (!isValidUsername(normalizedUsername)) {
      setUsernameAvailability({
        status: "error",
        value: normalizedUsername,
        message: "아이디는 3~30자 영문, 숫자, -, _만 사용할 수 있습니다."
      });
      return;
    }

    setUsernameAvailability({
      status: "checking",
      value: normalizedUsername,
      message: "아이디 중복을 확인하는 중입니다."
    });

    try {
      const response = await requestSignupAvailability({ username: normalizedUsername });
      const isAvailable = response.usernameAvailable === true;

      setUsernameAvailability({
        status: isAvailable ? "available" : "duplicate",
        value: normalizedUsername,
        message: isAvailable ? "사용 가능한 아이디입니다." : "이미 사용 중인 아이디입니다."
      });
    } catch (error) {
      setUsernameAvailability({
        status: "error",
        value: normalizedUsername,
        message: getApiErrorMessage(error, "아이디 중복 확인에 실패했습니다.")
      });
    }
  }

  async function handleEmailAvailabilityCheck(): Promise<void> {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      setEmailAvailability({
        status: "error",
        value: null,
        message: "이메일을 입력해주세요."
      });
      return;
    }

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setEmailAvailability({
        status: "error",
        value: normalizedEmail,
        message: "이메일 형식을 확인해주세요."
      });
      return;
    }

    setEmailAvailability({
      status: "checking",
      value: normalizedEmail,
      message: "이메일 중복을 확인하는 중입니다."
    });

    try {
      const response = await requestSignupAvailability({ email: normalizedEmail });
      const isAvailable = response.emailAvailable === true;

      setEmailAvailability({
        status: isAvailable ? "available" : "duplicate",
        value: normalizedEmail,
        message: isAvailable ? "사용 가능한 이메일입니다." : "이미 사용 중인 이메일입니다."
      });
    } catch (error) {
      setEmailAvailability({
        status: "error",
        value: normalizedEmail,
        message: getApiErrorMessage(error, "이메일 중복 확인에 실패했습니다.")
      });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);

    const formData = new FormData(event.currentTarget);
    const normalizedUsername = normalizeUsername(username);
    const normalizedEmail = normalizeEmail(email);
    const password = String(formData.get("password") ?? "");
    const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
    const payload: SignupRequest = {
      email: normalizedEmail,
      nickname: String(formData.get("nickname") ?? "").trim(),
      password,
      privacyAccepted,
      termsAccepted,
      username: normalizedUsername
    };

    if (!payload.username || !payload.nickname || !payload.email || !payload.password) {
      setErrorMessage("회원가입 정보를 모두 입력해주세요.");
      return;
    }

    if (!termsAccepted || !privacyAccepted) {
      setErrorMessage("서비스 이용약관과 개인정보 수집 및 이용에 모두 동의해주세요.");
      return;
    }

    if (!isCurrentValueAvailable(usernameAvailability, normalizedUsername)) {
      setErrorMessage("아이디 중복 확인을 완료해주세요.");
      return;
    }

    if (!isCurrentValueAvailable(emailAvailability, normalizedEmail)) {
      setErrorMessage("이메일 중복 확인을 완료해주세요.");
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
      <div className="authField">
        <label htmlFor="signup-username">아이디</label>
        <div className="authInlineControl">
          <input
            autoComplete="username"
            disabled={isSubmitting}
            id="signup-username"
            maxLength={30}
            minLength={3}
            name="username"
            onChange={(event) => {
              setUsername(event.target.value);
              setUsernameAvailability(INITIAL_AVAILABILITY_STATE);
            }}
            placeholder="아이디를 입력하세요."
            required
            type="text"
            value={username}
          />
          <button
            className="authCheckButton"
            disabled={
              isSubmitting || usernameAvailability.status === "checking" || !username.trim()
            }
            onClick={handleUsernameAvailabilityCheck}
            type="button"
          >
            <Search aria-hidden="true" size={16} />
            중복 확인
          </button>
        </div>
        <AvailabilityMessage state={usernameAvailability} />
      </div>
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
      <div className="authField fullField">
        <label htmlFor="signup-email">이메일</label>
        <div className="authInlineControl">
          <input
            autoComplete="email"
            disabled={isSubmitting}
            id="signup-email"
            name="email"
            onChange={(event) => {
              setEmail(event.target.value);
              setEmailAvailability(INITIAL_AVAILABILITY_STATE);
            }}
            placeholder="user@example.com"
            required
            type="email"
            value={email}
          />
          <button
            className="authCheckButton"
            disabled={isSubmitting || emailAvailability.status === "checking" || !email.trim()}
            onClick={handleEmailAvailabilityCheck}
            type="button"
          >
            <Search aria-hidden="true" size={16} />
            중복 확인
          </button>
        </div>
        <AvailabilityMessage state={emailAvailability} />
      </div>
      <div className="authField">
        <label htmlFor="signup-password">비밀번호</label>
        <div className="authPasswordField">
          <input
            aria-describedby="signup-password-help"
            autoComplete="new-password"
            disabled={isSubmitting}
            id="signup-password"
            maxLength={PASSWORD_MAX_LENGTH}
            minLength={PASSWORD_MIN_LENGTH}
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
          {PASSWORD_POLICY_HELP_TEXT}
        </span>
      </div>
      <div className="authField">
        <label htmlFor="signup-password-confirm">비밀번호 확인</label>
        <div className="authPasswordField">
          <input
            autoComplete="new-password"
            disabled={isSubmitting}
            id="signup-password-confirm"
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
      <div className="authConsentGroup fullField">
        <label className="authCheckboxLabel">
          <input
            checked={termsAccepted}
            disabled={isSubmitting}
            name="termsAccepted"
            onChange={(event) => setTermsAccepted(event.target.checked)}
            required
            type="checkbox"
          />
          <span>서비스 이용약관에 동의합니다.</span>
        </label>
        <label className="authCheckboxLabel">
          <input
            checked={privacyAccepted}
            disabled={isSubmitting}
            name="privacyAccepted"
            onChange={(event) => setPrivacyAccepted(event.target.checked)}
            required
            type="checkbox"
          />
          <span>개인정보 수집 및 이용에 동의합니다.</span>
        </label>
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

function AvailabilityMessage({ state }: { state: AvailabilityState }) {
  if (!state.message) {
    return null;
  }

  return (
    <span
      className={`authFieldStatus authFieldStatus${getAvailabilityClassSuffix(state.status)}`}
      role={state.status === "available" || state.status === "checking" ? "status" : "alert"}
    >
      {state.message}
    </span>
  );
}

function getAvailabilityClassSuffix(status: AvailabilityStatus): "Success" | "Error" | "Neutral" {
  if (status === "available") {
    return "Success";
  }

  if (status === "duplicate" || status === "error") {
    return "Error";
  }

  return "Neutral";
}

function isCurrentValueAvailable(state: AvailabilityState, value: string): boolean {
  return state.status === "available" && state.value === value;
}

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidUsername(value: string): boolean {
  return value.length >= 3 && value.length <= 30 && USERNAME_PATTERN.test(value);
}
