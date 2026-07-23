"use client";

import Link from "next/link";
import { Mail, UserRound } from "lucide-react";
import { useAuth } from "../../../../components/auth/auth-provider";
import styles from "./profile-settings.module.css";

export function ProfileSettingsClient() {
  const { user } = useAuth();
  const displayName = user?.nickname || user?.username || "SketchCatch 사용자";
  const avatarLabel = displayName.slice(0, 1).toUpperCase();

  return (
    <section className={styles.page} aria-labelledby="profile-settings-title">
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>MY PAGE</p>
          <h1 id="profile-settings-title">개인정보 수정</h1>
          <p>프로필에 표시되는 이름과 계정 정보를 확인할 수 있습니다.</p>
        </div>
      </header>

      <div className={styles.profileCard}>
        <div className={styles.profileSummary}>
          <div className={styles.avatar} aria-hidden="true">
            {avatarLabel}
          </div>
          <div>
            <strong>{displayName}</strong>
            <span>{user?.email}</span>
          </div>
        </div>

        <div className={styles.previewNotice} role="status">
          개인정보 수정 화면 미리보기입니다. 저장 기능은 아직 연결되지 않았습니다.
        </div>

        <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              <span>
                <UserRound aria-hidden="true" size={17} />
                이름
              </span>
              <input
                autoComplete="nickname"
                defaultValue={user?.nickname ?? ""}
                maxLength={40}
                name="nickname"
                placeholder="프로필에 표시할 이름"
                readOnly
                type="text"
              />
            </label>

            <label className={styles.field}>
              <span>
                <Mail aria-hidden="true" size={17} />
                이메일
              </span>
              <input
                autoComplete="email"
                defaultValue={user?.email ?? ""}
                name="email"
                placeholder="example@email.com"
                readOnly
                type="email"
              />
            </label>

            <label className={`${styles.field} ${styles.readOnlyField}`}>
              <span>아이디</span>
              <input defaultValue={user?.username ?? ""} name="username" readOnly type="text" />
              <small>아이디는 변경할 수 없습니다.</small>
            </label>
          </div>

          <div className={styles.actions}>
            <Link className={styles.cancelButton} href="/dashboard/settings">
              취소
            </Link>
            <button className={styles.saveButton} disabled type="submit">
              변경사항 저장
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
