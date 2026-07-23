"use client";

import {
  getPasswordPolicyErrorMessage,
  PASSWORD_POLICY_HELP_TEXT
} from "@sketchcatch/types";
import Link from "next/link";
import { LockKeyhole, UserRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useAuth } from "../../../../components/auth/auth-provider";
import { requestProfilePasswordVerification } from "../../../../lib/auth-api";
import { getApiErrorMessage } from "../../../../lib/api-client";
import styles from "./profile-settings.module.css";

type ProfileStep = "verify" | "edit";

export function ProfileSettingsClient() {
  const { canChangePassword, updateProfile, user } = useAuth();
  const [step, setStep] = useState<ProfileStep>("verify");
  const [currentPassword, setCurrentPassword] = useState("");
  const [name, setName] = useState(user?.nickname ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isPending, setIsPending] = useState(false);

  const effectiveStep = canChangePassword === false ? "edit" : step;
  const passwordPolicyError = newPassword ? getPasswordPolicyErrorMessage(newPassword) : null;
  const passwordsMatch =
    passwordConfirmation.length === 0 || newPassword === passwordConfirmation;
  const includesPasswordChange = newPassword.length > 0 || passwordConfirmation.length > 0;
  const canSubmitProfile =
    name.trim().length > 0 &&
    (!canChangePassword ||
      (!includesPasswordChange ||
        (!passwordPolicyError &&
          newPassword.length > 0 &&
          passwordConfirmation.length > 0 &&
          passwordsMatch)));

  async function handleVerificationSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!currentPassword) {
      setErrorMessage("현재 비밀번호를 입력해주세요.");
      return;
    }

    setIsPending(true);
    setErrorMessage("");
    try {
      await requestProfilePasswordVerification({ currentPassword });
      setCurrentPassword("");
      setStep("edit");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "현재 비밀번호를 확인하지 못했습니다."));
    } finally {
      setIsPending(false);
    }
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmitProfile || isPending) return;

    setIsPending(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      await updateProfile({
        nickname: name.trim(),
        ...(canChangePassword && includesPasswordChange
          ? {
              newPassword,
              newPasswordConfirmation: passwordConfirmation
            }
          : {})
      });
      setNewPassword("");
      setPasswordConfirmation("");
      setSuccessMessage("개인정보가 수정되었습니다.");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "개인정보를 수정하지 못했습니다."));
    } finally {
      setIsPending(false);
    }
  }

  if (effectiveStep === "verify") {
    return (
      <section className={styles.page} aria-labelledby="profile-verification-title">
        <header className={styles.pageHeader}>
          <h1 id="profile-verification-title">개인정보 수정</h1>
        </header>

        <div className={`${styles.profileCard} ${styles.verificationCard}`}>
          <div className={styles.cardHeading}>
            <span className={styles.headingIcon} aria-hidden="true">
              <LockKeyhole size={22} />
            </span>
            <div>
              <h2>본인 확인</h2>
              <p>개인정보 보호를 위해 현재 비밀번호를 입력해주세요.</p>
            </div>
          </div>

          <form className={styles.form} onSubmit={(event) => void handleVerificationSubmit(event)}>
            <label className={styles.field}>
              <span>현재 비밀번호</span>
              <input
                aria-describedby={errorMessage ? "current-password-error" : undefined}
                aria-invalid={errorMessage ? true : undefined}
                autoComplete="current-password"
                disabled={isPending}
                name="currentPassword"
                onChange={(event) => {
                  setCurrentPassword(event.target.value);
                  setErrorMessage("");
                }}
                placeholder="현재 비밀번호를 입력해주세요"
                type="password"
                value={currentPassword}
              />
              {errorMessage ? (
                <small className={styles.errorMessage} id="current-password-error">
                  {errorMessage}
                </small>
              ) : null}
            </label>

            <div className={styles.actions}>
              <Link className={styles.cancelButton} href="/dashboard/settings">
                취소
              </Link>
              <button className={styles.saveButton} disabled={isPending} type="submit">
                {isPending ? "확인 중..." : "확인"}
              </button>
            </div>
          </form>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.page} aria-labelledby="profile-settings-title">
      <header className={styles.pageHeader}>
        <h1 id="profile-settings-title">개인정보 수정</h1>
      </header>

      <div className={styles.profileCard}>
        <form className={styles.form} onSubmit={(event) => void handleProfileSubmit(event)}>
          <div className={styles.fieldGrid}>
            <label className={`${styles.field} ${styles.fullWidthField}`}>
              <span>
                <UserRound aria-hidden="true" size={17} />
                이름
              </span>
              <input
                autoComplete="nickname"
                disabled={isPending}
                maxLength={40}
                name="name"
                onChange={(event) => {
                  setName(event.target.value);
                  setSuccessMessage("");
                }}
                placeholder="변경할 이름을 입력해주세요"
                type="text"
                value={name}
              />
            </label>

            {canChangePassword ? (
              <div className={styles.passwordFields}>
                <label className={styles.field}>
                  <span>
                    <LockKeyhole aria-hidden="true" size={17} />
                    새 비밀번호
                  </span>
                  <input
                    aria-describedby={passwordPolicyError ? "new-password-error" : "password-hint"}
                    aria-invalid={passwordPolicyError ? true : undefined}
                    autoComplete="new-password"
                    disabled={isPending}
                    name="newPassword"
                    onChange={(event) => {
                      setNewPassword(event.target.value);
                      setSuccessMessage("");
                    }}
                    placeholder="변경할 때만 입력해주세요"
                    type="password"
                    value={newPassword}
                  />
                </label>

                <label className={styles.field}>
                  <span>
                    <LockKeyhole aria-hidden="true" size={17} />
                    비밀번호 확인
                  </span>
                  <input
                    aria-describedby={!passwordsMatch ? "password-confirmation-error" : undefined}
                    aria-invalid={!passwordsMatch || undefined}
                    autoComplete="new-password"
                    disabled={isPending}
                    name="newPasswordConfirmation"
                    onChange={(event) => {
                      setPasswordConfirmation(event.target.value);
                      setSuccessMessage("");
                    }}
                    placeholder="새 비밀번호를 한 번 더 입력해주세요"
                    type="password"
                    value={passwordConfirmation}
                  />
                </label>

                <div className={styles.passwordFeedback}>
                  {passwordPolicyError ? (
                    <small className={styles.errorMessage} id="new-password-error">
                      {passwordPolicyError}
                    </small>
                  ) : passwordsMatch ? (
                    <small className={styles.fieldHint} id="password-hint">
                      {PASSWORD_POLICY_HELP_TEXT}
                    </small>
                  ) : null}
                  {!passwordsMatch ? (
                    <small className={styles.errorMessage} id="password-confirmation-error">
                      비밀번호가 일치하지 않습니다.
                    </small>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          {errorMessage ? <p className={styles.formError}>{errorMessage}</p> : null}
          {successMessage ? (
            <p className={styles.successMessage} role="status">
              {successMessage}
            </p>
          ) : null}

          <div className={styles.actions}>
            {canChangePassword ? (
              <button
                className={styles.cancelButton}
                disabled={isPending}
                onClick={() => {
                  setStep("verify");
                }}
                type="button"
              >
                취소
              </button>
            ) : (
              <Link className={styles.cancelButton} href="/dashboard/settings">
                취소
              </Link>
            )}
            <button
              className={styles.saveButton}
              disabled={!canSubmitProfile || isPending}
              type="submit"
            >
              {isPending ? "수정 중..." : "수정하기"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
