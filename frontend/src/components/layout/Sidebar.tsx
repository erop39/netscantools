import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "../../api/client";
import type { Notification } from "../../types";
import {
  IconBell,
  IconChevronLeft,
  IconChevronRight,
  IconDevices,
  IconHome,
  IconHygiene,
  IconInventory,
  IconLogout,
  IconPlanner,
  IconScans,
  IconSettings,
} from "../icons";
import { formatTime, formatTimeZoneLabel, getUserTimeZone } from "../../lib/time";

type IconComp = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

const navItems: {
  to: string;
  label: string;
  end?: boolean;
  Icon: IconComp;
}[] = [
  { to: "/", label: "Home", end: true, Icon: IconHome },
  { to: "/devices", label: "Devices", Icon: IconDevices },
  { to: "/hygiene", label: "Hygiene", Icon: IconHygiene },
  { to: "/inventory", label: "Inventory", Icon: IconInventory },
  { to: "/planner", label: "Planner", Icon: IconPlanner },
  { to: "/scans", label: "Scans", Icon: IconScans },
  { to: "/notifications", label: "Notifications", Icon: IconBell },
  { to: "/settings", label: "Settings", Icon: IconSettings },
];

type Props = {
  collapsed: boolean;
  onToggle: () => void;
};

export function Sidebar({ collapsed, onToggle }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await apiFetch<Notification[]>("/api/notifications");
        if (!cancelled) {
          setUnread(list.filter((n) => !n.read).length);
        }
      } catch {
        // badge is optional
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  async function handleLogout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // still leave
    }
    navigate("/login", { replace: true });
  }

  return (
    <aside
      className={`sidebar-shell glass-panel ${collapsed ? "is-collapsed" : ""}`}
      data-collapsed={collapsed ? "true" : "false"}
      aria-label="Main navigation"
    >
      {/* Edge toggle — not a nav item */}
      <button
        type="button"
        className="sidebar-edge-toggle"
        onClick={onToggle}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
      >
        {collapsed ? <IconChevronRight size={14} /> : <IconChevronLeft size={14} />}
      </button>

      {!collapsed && (
        <header className="sidebar-header">
          <img
            className="login-logo sidebar-logo"
            src="/icon.png"
            alt=""
            width={40}
            height={40}
          />
          <div className="sidebar-brand">
            <div className="sidebar-brand-row">
              <div className="sidebar-brand-title">eG::39</div>
              <span
                className="sidebar-link"
                title="Link up"
                aria-label="Link up"
              />
            </div>
            <div className="sidebar-brand-sub">netscantools</div>
          </div>
        </header>
      )}

      {collapsed && (
        <div className="sidebar-collapsed-logo" title="eG::39 · link up">
          <img
            className="login-logo sidebar-logo"
            src="/icon.png"
            alt="eG::39"
            width={40}
            height={40}
          />
        </div>
      )}

      <div className="sidebar-divider" />

      {!collapsed && <div className="sidebar-nav-label">Ops</div>}

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end ?? false}
            title={item.label}
            className={({ isActive }) =>
              ["nav-item", collapsed ? "is-icon-only" : "", isActive ? "is-active" : ""]
                .filter(Boolean)
                .join(" ")
            }
          >
            <item.Icon size={19} className="nav-icon" />
            <span className="nav-label">{item.label}</span>
            {item.to === "/notifications" && unread > 0 && (
              <span className="nav-badge">{unread > 99 ? "99+" : unread}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-divider sidebar-divider-bottom" />

        {!collapsed && (
          <div
            className="sidebar-clock"
            title={`${getUserTimeZone()} · PC local time`}
          >
            <span className="sidebar-clock-time">
              {formatTime(clock.toISOString())}
            </span>
            <span className="sidebar-clock-tz">{formatTimeZoneLabel(clock)}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleLogout}
          title="Log out"
          className={`nav-item sidebar-logout ${collapsed ? "is-icon-only" : ""}`}
        >
          <IconLogout size={19} className="nav-icon" />
          <span className="nav-label">Log out</span>
        </button>
      </div>
    </aside>
  );
}
