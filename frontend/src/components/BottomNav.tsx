import { NavLink, useLocation } from "react-router-dom";

import { useUiStore } from "../store/uiStore";

function AppIcon({ name }: { name: "favorites" | "feed" | "folders" | "settings" }) {
  switch (name) {
    case "feed":
      return (
        <svg aria-hidden="true" className="bottom-nav__icon" viewBox="0 0 24 24">
          <path
            d="m12 2.9 1.65 4.34 4.34 1.65-4.34 1.65L12 14.88l-1.65-4.34-4.34-1.65 4.34-1.65L12 2.9Zm6.2 9.45.8 2.12 2.12.8-2.12.8-.8 2.12-.8-2.12-2.12-.8 2.12-.8.8-2.12ZM7.05 14.9l1.05 2.8 2.8 1.05-2.8 1.05-1.05 2.8-1.05-2.8-2.8-1.05 2.8-1.05 1.05-2.8Z"
            fill="currentColor"
          />
        </svg>
      );
    case "folders":
      return (
        <svg aria-hidden="true" className="bottom-nav__icon" viewBox="0 0 24 24">
          <path
            d="M3 6.5A2.5 2.5 0 0 1 5.5 4H9l2 2h7.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Zm2.5-.5a.5.5 0 0 0-.5.5v1h13.5a2.48 2.48 0 0 1 .5.05V8.5a.5.5 0 0 0-.5-.5H10.17l-2-2H5.5ZM5 9.5v8a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5v-8a.5.5 0 0 0-.5-.5h-13a.5.5 0 0 0-.5.5Z"
            fill="currentColor"
          />
        </svg>
      );
    case "favorites":
      return (
        <svg aria-hidden="true" className="bottom-nav__icon" viewBox="0 0 24 24">
          <path
            d="M12 20.7 4.93 13.9a4.93 4.93 0 0 1 6.97-6.97L12 7.03l.1-.1a4.93 4.93 0 1 1 6.97 6.97L12 20.7Z"
            fill="currentColor"
          />
        </svg>
      );
    case "settings":
      return (
        <svg aria-hidden="true" className="bottom-nav__icon" viewBox="0 0 24 24">
          <path
            d="m10.8 3.2.44 1.94a7.2 7.2 0 0 1 1.52 0l.44-1.94 2.02.56-.44 1.92c.47.23.9.5 1.31.84l1.72-.95 1.08 1.8-1.7.95c.15.48.26.97.31 1.49l1.93.45v2.04l-1.93.45a7.18 7.18 0 0 1-.31 1.48l1.7.96-1.08 1.8-1.72-.96c-.4.34-.84.62-1.31.84l.44 1.92-2.02.56-.44-1.94a7.2 7.2 0 0 1-1.52 0l-.44 1.94-2.02-.56.44-1.92a7.6 7.6 0 0 1-1.31-.84l-1.72.96-1.08-1.8 1.7-.96a7.18 7.18 0 0 1-.31-1.48L3 13.02v-2.04l1.93-.45c.05-.52.16-1.01.31-1.49l-1.7-.95 1.08-1.8 1.72.95c.4-.34.84-.61 1.31-.84l-.44-1.92 2.02-.56ZM12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z"
            fill="currentColor"
          />
        </svg>
      );
  }
}

const items = [
  { icon: "feed" as const, label: "For You", to: "/feed" },
  { icon: "favorites" as const, label: "Favorites", to: "/favorites" },
  { icon: "folders" as const, label: "Folders", to: "/folders" },
  { icon: "settings" as const, label: "Settings", to: "/settings" }
];

export function BottomNav() {
  const location = useLocation();
  const feedControlsVisible = useUiStore((state) => state.feedControlsVisible);
  const normalizedPathname = location.pathname.replace(/\/+$/, "") || "/";
  const className =
    normalizedPathname === "/feed" && !feedControlsVisible ? "bottom-nav bottom-nav--hidden" : "bottom-nav";

  return (
    <nav className={className} aria-label="Primary navigation">
      {items.map((item) => (
        <NavLink
          aria-label={item.label}
          key={item.to}
          className={({ isActive }) => (isActive ? "bottom-nav__item bottom-nav__item--active" : "bottom-nav__item")}
          to={item.to}
        >
          <AppIcon name={item.icon} />
        </NavLink>
      ))}
    </nav>
  );
}
