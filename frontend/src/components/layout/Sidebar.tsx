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
      // still leave
    }
    navigate("/login", { replace: true });
  }

  return (
    <aside className="glass-panel fixed top-5 left-5 bottom-8 z-20 flex w-[268px] flex-col p-3.5">
      <header className="relative z-[1] mb-2 flex items-center gap-3 px-2.5 pb-4 pt-2">
        <div className="login-logo !m-0 !h-10 !w-10 !rounded-[14px] !text-base !shadow-[0_6px_18px_rgb(14_165_233/35%)]">
          q
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold tracking-tight text-white">qube.li</div>
          <div className="text-[11px] font-medium tracking-wide text-sky-200/55">
            NetInventory
          </div>
        </div>
        <IconMenu size={17} className="text-white/35" />
      </header>

      <div className="relative z-[1] mx-1 mb-3 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />

      <nav className="relative z-[1] flex flex-1 flex-col gap-1 px-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end ?? false}
            className={({ isActive }) => ["nav-item", isActive ? "is-active" : ""].join(" ")}
          >
            <item.Icon size={19} className="nav-icon" />
            <span className="flex-1">{item.label}</span>
            {item.to === "/notifications" && unread > 0 && (
              <span className="nav-badge">{unread > 99 ? "99+" : unread}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="relative z-[1] mx-1 mt-2 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <button type="button" onClick={handleLogout} className="nav-item relative z-[1] mt-2 text-left">
        <IconLogout size={19} className="nav-icon" />
        <span>Log out</span>
      </button>
    </aside>
  );
}
