import { Button } from "@sketchcatch/ui";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="pageShell">
      <section className="hero">
        <p className="eyebrow">SketchCatch</p>
        <h1>SketchCatch</h1>
        <p>Visual AWS practice architecture platform</p>
        <div className="heroActions">
          <Link className="workspaceLink" href="/workspace">
            Open workspace placeholder
          </Link>
          <Button>Shared UI placeholder</Button>
        </div>
      </section>
    </main>
  );
}
