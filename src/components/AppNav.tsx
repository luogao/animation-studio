// ============================================================
// AppNav.tsx — 全局导航栏（Duotone Poster 风格）
// ============================================================

import { Link, useLocation } from "react-router-dom";

export function AppNav() {
  const location = useLocation();

  const linkClass = (path: string) =>
    `text-sm font-display font-bold uppercase tracking-tight transition-colors ${
      location.pathname === path
        ? "text-primary"
        : "text-foreground hover:text-primary"
    }`;

  return (
    <nav className="flex items-center gap-6 px-6 py-3 border-b-2 border-foreground shrink-0 bg-paper">
      <Link to="/" className="font-display text-lg font-bold tracking-tight text-primary uppercase no-underline">
        Animation Studio
      </Link>
      <div className="flex items-center gap-4 ml-4">
        <Link to="/" className={linkClass("/")}>
          首页
        </Link>
        <Link to="/projects" className={linkClass("/projects")}>
          项目
        </Link>
      </div>
    </nav>
  );
}
