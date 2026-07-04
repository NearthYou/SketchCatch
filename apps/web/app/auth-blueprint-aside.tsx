type AuthBlueprintAsideProps = {
  readonly mode: "login" | "signup" | "reset";
};

const asideCopy = {
  login: {
    title: "안전 게이트를 통과한 IaC 작업으로 복귀",
    meta: "Saved workspace"
  },
  reset: {
    title: "계정 복구 후 같은 Practice Architecture로 복귀",
    meta: "Account recovery"
  },
  signup: {
    title: "Terraform-first, multi-cloud-ready IaC 운영 여정 시작",
    meta: "New operator"
  }
} as const;

export function AuthBlueprintAside({ mode }: AuthBlueprintAsideProps) {
  const copy = asideCopy[mode];

  return (
    <aside className="authBlueprintAside" aria-label="SketchCatch Blueprint summary">
      <div className="authAsideSchematic" aria-hidden="true">
        <span className="authAsideNode authAsideNodeInput">REQ</span>
        <span className="authAsideNode authAsideNodeBoard">BOARD</span>
        <span className="authAsideNode authAsideNodePlan">PLAN</span>
        <span className="authAsideNode authAsideNodeGate">GATE</span>
        <span className="authAsideLine authAsideLineOne" />
        <span className="authAsideLine authAsideLineTwo" />
        <span className="authAsideLine authAsideLineThree" />
      </div>
      <div className="authAsideTitleblock">
        <div>
          <span>PRODUCT</span>
          <strong>SketchCatch</strong>
        </div>
        <div>
          <span>MODE</span>
          <strong>{copy.meta}</strong>
        </div>
        <div>
          <span>DIRECTION</span>
          <strong>Terraform-first · multi-cloud-ready</strong>
        </div>
        <div>
          <span>GATE</span>
          <strong>HIGH / MED / LOW</strong>
        </div>
      </div>
      <p>{copy.title}</p>
    </aside>
  );
}
