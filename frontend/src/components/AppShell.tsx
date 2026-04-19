import { Outlet, useLocation } from "react-router-dom";

import { BottomNav } from "./BottomNav";

export function AppShell() {
  const location = useLocation();
  const shellClassName = location.pathname === "/feed" ? "app-shell app-shell--feed" : "app-shell app-shell--panel";

  return (
    <div className={shellClassName}>
      <main className="page-stack">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
