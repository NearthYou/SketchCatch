import type { ReactNode } from "react";

export type DashboardIconName =
  | "bell"
  | "billing"
  | "chart"
  | "check"
  | "clock"
  | "close"
  | "cloud"
  | "edit"
  | "folder"
  | "github"
  | "heart"
  | "home"
  | "layers"
  | "link"
  | "lock"
  | "plus"
  | "rocket"
  | "search"
  | "server"
  | "settings"
  | "shield"
  | "trash";

export function DashboardIcon({ name }: { readonly name: DashboardIconName }) {
  let content: ReactNode;

  switch (name) {
    case "bell":
      content = (
        <>
          <path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" />
          <path d="M10 21h4" />
        </>
      );
      break;
    case "billing":
      content = (
        <>
          <path d="M3 7h18v11H3z" />
          <path d="M3 10h18" />
          <path d="M15 15h3" />
        </>
      );
      break;
    case "chart":
      content = (
        <>
          <path d="M4 19V5" />
          <path d="M4 19h17" />
          <path d="M8 15v-4" />
          <path d="M13 15V8" />
          <path d="M18 15v-7" />
        </>
      );
      break;
    case "check":
      content = <path d="m5 12 4 4L19 6" />;
      break;
    case "clock":
      content = (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      );
      break;
    case "close":
      content = (
        <>
          <path d="M6 6l12 12" />
          <path d="M18 6 6 18" />
        </>
      );
      break;
    case "cloud":
      content = (
        <>
          <path d="M6 18h12a4 4 0 0 0 0-8 6 6 0 0 0-11-2 5 5 0 0 0-1 10" />
          <path d="M9 14h6" />
        </>
      );
      break;
    case "edit":
      content = (
        <>
          <path d="M4 20h4l11-11-4-4L4 16z" />
          <path d="m13 7 4 4" />
        </>
      );
      break;
    case "folder":
      content = (
        <>
          <path d="M3 6h6l2 2h10v10H3z" />
          <path d="M3 10h18" />
        </>
      );
      break;
    case "github":
      content = (
        <>
          <path d="M9 19c-5 1.5-5-2.5-7-3" />
          <path d="M15 22v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.1-1.5 6.1-6.6a5.1 5.1 0 0 0-1.4-3.5 4.8 4.8 0 0 0-.1-3.5s-1.1-.3-3.6 1.4a12.3 12.3 0 0 0-6.6 0C6 1.1 4.9 1.4 4.9 1.4a4.8 4.8 0 0 0-.1 3.5 5.1 5.1 0 0 0-1.4 3.5c0 5.1 3.1 6.3 6.1 6.6a3.4 3.4 0 0 0-.9 2.6V22" />
        </>
      );
      break;
    case "heart":
      content = <path d="M20.8 5.8a5.5 5.5 0 0 0-7.8 0L12 6.8l-1-1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.4a5.5 5.5 0 0 0 0-7.8" />;
      break;
    case "home":
      content = (
        <>
          <path d="m3 10 9-7 9 7" />
          <path d="M5 10v10h14V10" />
          <path d="M9 20v-6h6v6" />
        </>
      );
      break;
    case "layers":
      content = (
        <>
          <path d="m12 3 9 5-9 5-9-5z" />
          <path d="m3 12 9 5 9-5" />
          <path d="m3 16 9 5 9-5" />
        </>
      );
      break;
    case "link":
      content = (
        <>
          <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
          <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
        </>
      );
      break;
    case "lock":
      content = (
        <>
          <path d="M6 11h12v10H6z" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </>
      );
      break;
    case "plus":
      content = (
        <>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </>
      );
      break;
    case "rocket":
      content = (
        <>
          <path d="M13 4c4 1 6 3 7 7l-7 7-5-5z" />
          <path d="M7 14 4 17l3 1 1 3 3-3" />
          <path d="M15 9h.01" />
        </>
      );
      break;
    case "search":
      content = (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </>
      );
      break;
    case "server":
      content = (
        <>
          <path d="M4 5h16v6H4z" />
          <path d="M4 13h16v6H4z" />
          <path d="M8 8h.01" />
          <path d="M8 16h.01" />
        </>
      );
      break;
    case "settings":
      content = (
        <>
          <path d="M4 7h4" />
          <path d="M14 7h6" />
          <circle cx="11" cy="7" r="3" />
          <path d="M4 17h7" />
          <path d="M17 17h3" />
          <circle cx="14" cy="17" r="3" />
        </>
      );
      break;
    case "shield":
      content = (
        <>
          <path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z" />
          <path d="m9 12 2 2 4-5" />
        </>
      );
      break;
    case "trash":
      content = (
        <>
          <path d="M4 7h16" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M6 7l1 14h10l1-14" />
          <path d="M9 7V4h6v3" />
        </>
      );
      break;
  }

  return (
    <svg
      aria-hidden="true"
      className="dashboardIcon"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9">
        {content}
      </g>
    </svg>
  );
}
