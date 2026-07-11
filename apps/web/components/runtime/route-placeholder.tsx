import Link from "next/link";
import type { ReactNode } from "react";

export type RoutePlaceholderLink = {
  readonly href: string;
  readonly label: string;
};

export type RoutePlaceholderProps = {
  readonly children?: ReactNode;
  readonly description: string;
  readonly links?: readonly RoutePlaceholderLink[];
  readonly title: string;
};

export function RoutePlaceholder({ children, description, links = [], title }: RoutePlaceholderProps) {
  return (
    <main>
      <header>
        <p>SketchCatch</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>

      {children}

      {links.length > 0 ? (
        <nav aria-label="SketchCatch routes">
          <ul>
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </main>
  );
}
