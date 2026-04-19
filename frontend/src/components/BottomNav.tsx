import { NavLink, useLocation } from "react-router-dom";

import { useUiStore } from "../store/uiStore";

function AppIcon({ name }: { name: "feed" | "folders" | "settings" | "upload" }) {
  switch (name) {
    case "feed":
      return (
        <svg aria-hidden="true" className="bottom-nav__icon" viewBox="0 0 24 24">
          <path
            d="M12 3 4.5 7v10L12 21l7.5-4V7L12 3Zm0 2.2 5.2 2.75L12 10.7 6.8 7.95 12 5.2Zm-6 4.28 5 2.66v6.12l-5-2.66V9.48Zm7 8.78v-6.12l5-2.66v6.12l-5 2.66Z"
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
    case "upload":
      return (
        <svg aria-hidden="true" className="bottom-nav__icon" viewBox="0 0 24 24">
          <path
            d="M11 4.5a1 1 0 0 1 2 0v8.09l2.8-2.8a1 1 0 1 1 1.4 1.42l-4.5 4.5a1 1 0 0 1-1.4 0l-4.5-4.5a1 1 0 1 1 1.4-1.42l2.8 2.8V4.5ZM5 18a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1Z"
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
  { icon: "folders" as const, label: "Folders", to: "/folders" },
  { icon: "upload" as const, label: "Upload", to: "/upload" },
  { icon: "settings" as const, label: "Settings", to: "/settings" }
];

export function BottomNav() {
  const location = useLocation();
  const feedControlsVisible = useUiStore((state) => state.feedControlsVisible);
  const className =
    location.pathname === "/feed" && !feedControlsVisible ? "bottom-nav bottom-nav--hidden" : "bottom-nav";

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
