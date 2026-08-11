import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "../../api/client";
import type { Notification } from "../../types";
import {
  IconBell,
  IconDevices,
  IconHome,
  IconLogout,
  IconMenu,
  IconScans,
  IconSettings,
} from "../icons";

type IconComp = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

const navItems: {
  to: string;
  label: string;
  end?: boolean;
  Icon: IconComp;
}[] = [
  { to: "/", label: "Home", end: true, Icon: IconHome },
  { to: "/devices", label: "Devices", Icon: IconDevices },
  { to: "/scans", label: "Scans", Icon: IconScans },
  { to: "/notifications", label: "Notifications", Icon: IconBell },
  { to: "/settings", label: "Settings", Icon: IconSettings },
];

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [unread, setUnread] = useState(0);

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
      // still leave the shell if cookie clear fails
    }
    navigate("/login", { replace: true });
  }

  return (
    <aside className="glass-panel fixed top-6 left-6 bottom-11 z-20 flex w-[260px] flex-col gap-1 p-4">
      <header className="mb-3 flex items-center gap-3 border-b border-white/[0.08] px-2 pb-4 pt-1">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 shadow-inner">
          <span className="text-sm font-bold tracking-tight text-white/95">q</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold tracking-tight text-white/95">qube.li</div>
          <div className="text-xs text-white/55">NetInventory</div>
        </div>
        <IconMenu size={18} className="text-white/45" />
      </header>

      <nav className="flex flex-1 flex-col gap-1.5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end ?? false}
            className={({ isActive }) => ["nav-item", isActive ? "is-active" : ""].join(" ")}
          >
            <item.Icon size={20} className="nav-icon" />
            <span className="flex-1">{item.label}</span>
            {item.to === "/notifications" && unread > 0 && (
              <span className="min-w-[22px] rounded-full bg-sky-400/25 px-1.5 py-0.5 text-center text-xs font-medium text-sky-100 ring-1 ring-sky-300/25">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <button type="button" onClick={handleLogout} className="nav-item mt-auto text-left">
        <IconLogout size={20} className="nav-icon" />
        <span>Log out</span>
      </button>
    </aside>
  );
}
