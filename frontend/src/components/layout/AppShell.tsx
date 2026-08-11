import { useCallback, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

const STORAGE_KEY = "netpad_sidebar_collapsed";

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      // ignore
    }
    document.documentElement.dataset.sidebar = collapsed ? "collapsed" : "expanded";
  }, [collapsed]);

  const toggle = useCallback(() => {
    setCollapsed((v) => !v);
  }, []);

  return (
    <div className={`app-shell ${collapsed ? "is-sidebar-collapsed" : ""}`}>
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <main className="app-main">
        <div className="app-main-inner">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
