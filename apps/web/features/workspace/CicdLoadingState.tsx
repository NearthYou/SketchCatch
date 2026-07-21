import styles from "./delivery-center.module.css";

export function CicdLoadingState() {
  return (
    <div aria-busy="true" className={styles.loadingState} role="status">
      <span className={styles.loadingStatus}>CI/CD 준비 상태를 불러오는 중입니다.</span>
      <div aria-hidden="true" className={styles.loadingStatusBoard}>
        <div>
          <i className={styles.loadingLineShort} />
          <i className={styles.loadingLineTitle} />
          <i className={styles.loadingLineBody} />
        </div>
        <i className={styles.loadingAction} />
      </div>
      <div aria-hidden="true" className={styles.loadingChecklist}>
        <strong>준비 체크리스트</strong>
        {["01", "02", "03", "04"].map((phase) => (
          <div key={phase}>
            <span>{phase}</span>
            <i />
          </div>
        ))}
      </div>
    </div>
  );
}
