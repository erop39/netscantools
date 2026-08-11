import { NavLink, useNavigate } from "react-router-dom";
import { apiFetch } from "../../api/client";

const navItems = [
  { to: "/", label: "Home", end: true },
  { to: "/devices", label: "Devices" },
  { to: "/scans", label: "Scans" },
  { to: "/notifications", label: "Notifications" },
  { to: "/settings", label: "Settings" },
] as const;

export function Sidebar() {
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // still leave the shell if cookie clear fails
    }
    navigate("/login", { replace: true });
  }

  return (
    <aside className="fixed top-6 left-6 bottom-11 z-20 flex w-[260px] flex-col gap-2 rounded-[34px] border-[3px] border-white/12 bg-black/12 p-4 backdrop-blur-[30px]">
      <div className="mb-4 px-2 pt-1">
        <div className="text-lg font-semibold tracking-tight text-white/95">qube.li</div>
        <div className="text-sm text-white/60">NetInventory</div>
      </div>

      <nav className="flex flex-1 flex-col gap-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={"end" in item ? item.end : false}
            className={({ isActive }) =>
              [
                "flex h-[50px] items-center rounded-md px-4 text-[15px] text-white/95 transition-colors",
                isActive ? "bg-white/10" : "hover:bg-white/[0.03]",
              ].join(" ")
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <button
        type="button"
        onClick={handleLogout}
        className="mt-auto flex h-[50px] items-center rounded-md px-4 text-left text-[15px] text-white/80 transition-colors hover:bg-white/[0.03] hover:text-white/95"
      >
        Log out
      </button>
    </aside>
  );
}
