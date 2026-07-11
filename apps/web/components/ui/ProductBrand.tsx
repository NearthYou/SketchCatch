import Image from "next/image";
import Link from "next/link";
import styles from "./product-ui.module.css";

type ProductBrandProps = {
  readonly compact?: boolean;
  readonly href?: string;
};

// 제품 로고와 이름을 모든 작업 화면에서 같은 간격으로 보여줍니다.
export function ProductBrand({ compact = false, href = "/dashboard" }: ProductBrandProps) {
  return (
    <Link
      aria-label="SketchCatch Dashboard"
      className={styles.brand}
      data-compact={compact}
      href={href}
    >
      <Image alt="" height={24} priority src="/sketchcatch-logo.png" width={16} />
      <span>SketchCatch</span>
    </Link>
  );
}
