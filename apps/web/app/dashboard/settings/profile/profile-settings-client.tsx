"use client";

import Link from "next/link";
import { LockKeyhole, UserRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useAuth } from "../../../../components/auth/auth-provider";
import styles from "./profile-settings.module.css";

type ProfileStep = "verify" | "edit";

export function ProfileSettingsClient() {
  const { user } = useAuth();
  const [step, setStep] = useState<ProfileStep>("verify");
  const [currentPassword, setCurrentPassword] = useState("");
  const [name, setName] = useState(user?.nickname ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [verificationError, setVerificationError] = useState("");

  const passwordsMatch =
    newPassword.length === 0 ||
    passwordConfirmation.length === 0 ||
    newPassword === passwordConfirmation;

  function handleVerificationSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!currentPassword) {
      setVerificationError("현재 비밀번호를 입력해주세요.");
      return;
    }

    setVerificationError("");
    setStep("edit");
  }

  function handleProfileSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
  }

  if (step === "verify") {
    return (
      <section className={styles.page} aria-labelledby="profile-verification-title">
        <header className={styles.pageHeader}>
          <h1 id="profile-verification-title">마이페이지</h1>
        </header>

        <div className={`${styles.profileCard} ${styles.verificationCard}`}>
          <div className={styles.cardHeading}>
            <span className={styles.headingIcon} aria-hidden="true">
              <LockKeyhole size={22} />
            </span>
            <div>
              <h2>본인 확인</h2>
              <p>
                개인정보 보호를 위해 현재 비밀번호를 입력해주세요. 실제 일치 검증은
                API 연결 후 적용됩니다.
              </p>
            </div>
          </div>

          <form className={styles.form} onSubmit={handleVerificationSubmit}>
            <label className={styles.field}>
              <span>현재 비밀번호</span>
              <input
                aria-describedby={verificationError ? "current-password-error" : undefined}
                aria-invalid={verificationError ? true : undefined}
                autoComplete="current-password"
                name="currentPassword"
                onChange={(event) => {
                  setCurrentPassword(event.target.value);
                  setVerificationError("");
                }}
                placeholder="현재 비밀번호를 입력해주세요"
                type="password"
                value={currentPassword}
              />
              {verificationError ? (
                <small className={styles.errorMessage} id="current-password-error">
                  {verificationError}
                </small>
              ) : null}
            </label>

            <div className={styles.actions}>
              <Link className={styles.cancelButton} href="/dashboard/settings">
                취소
              </Link>
              <button className={styles.saveButton} type="submit">
                확인
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
        <div className={styles.previewNotice} role="status">
          개인정보 수정 화면 미리보기입니다. 저장 기능은 아직 연결되지 않았습니다.
        </div>

        <form className={styles.form} onSubmit={handleProfileSubmit}>
          <div className={styles.fieldGrid}>
            <label className={`${styles.field} ${styles.fullWidthField}`}>
              <span>
                <UserRound aria-hidden="true" size={17} />
                이름
              </span>
              <input
                autoComplete="nickname"
                maxLength={40}
                name="name"
                onChange={(event) => setName(event.target.value)}
                placeholder="변경할 이름을 입력해주세요"
                type="text"
                value={name}
              />
            </label>

            <label className={styles.field}>
              <span>
                <LockKeyhole aria-hidden="true" size={17} />
                새 비밀번호
              </span>
              <input
                autoComplete="new-password"
                name="newPassword"
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="새 비밀번호를 입력해주세요"
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
                name="passwordConfirmation"
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                placeholder="새 비밀번호를 한 번 더 입력해주세요"
                type="password"
                value={passwordConfirmation}
              />
              {!passwordsMatch ? (
                <small className={styles.errorMessage} id="password-confirmation-error">
                  비밀번호가 일치하지 않습니다.
                </small>
              ) : null}
            </label>
          </div>

          <div className={styles.actions}>
            <button
              className={styles.cancelButton}
              onClick={() => setStep("verify")}
              type="button"
            >
              취소
            </button>
            <button
              className={styles.saveButton}
              disabled
              type="submit"
            >
              수정하기
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
