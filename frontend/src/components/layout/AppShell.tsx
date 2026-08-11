import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="min-h-screen pl-[300px] pr-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
