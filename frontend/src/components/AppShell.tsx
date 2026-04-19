import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { useUiStore } from "../store/uiStore";
import { BottomNav } from "./BottomNav";

export function AppShell() {
  const hydratePreferences = useUiStore((state) => state.hydratePreferences);
  const location = useLocation();
  const pageStackRef = useRef<HTMLElement | null>(null);
  const normalizedPathname = location.pathname.replace(/\/+$/, "") || "/";
  const isFeedRoute = normalizedPathname === "/feed";
  const shellClassName = isFeedRoute ? "app-shell app-shell--feed" : "app-shell app-shell--panel";

  useEffect(() => {
    void hydratePreferences();
  }, [hydratePreferences]);

  useEffect(() => {
    const rootElement = document.documentElement;
    const visualViewport = window.visualViewport;

    function updateAppHeight() {
      const nextHeight = Math.round(visualViewport?.height ?? window.innerHeight);
      rootElement.style.setProperty("--app-height", `${nextHeight}px`);
    }

    updateAppHeight();
    window.addEventListener("resize", updateAppHeight);
    visualViewport?.addEventListener("resize", updateAppHeight);
    visualViewport?.addEventListener("scroll", updateAppHeight);

    return () => {
      window.removeEventListener("resize", updateAppHeight);
      visualViewport?.removeEventListener("resize", updateAppHeight);
      visualViewport?.removeEventListener("scroll", updateAppHeight);
    };
  }, []);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      pageStackRef.current?.scrollTo({ top: 0, left: 0 });
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [location.pathname]);

  return (
    <div className={shellClassName}>
      <main ref={pageStackRef} className="page-stack">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
