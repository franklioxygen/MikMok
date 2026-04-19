import { NavLink } from "react-router-dom";

const items = [
  { label: "For You", to: "/feed" },
  { label: "Folders", to: "/folders" },
  { label: "Upload", to: "/upload" },
  { label: "Settings", to: "/settings" }
];

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      {items.map((item) => (
        <NavLink
          key={item.to}
          className={({ isActive }) => (isActive ? "bottom-nav__item bottom-nav__item--active" : "bottom-nav__item")}
          to={item.to}
        >
          <span className="bottom-nav__label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
