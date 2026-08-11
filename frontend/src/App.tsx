import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { DeviceDetail } from "./pages/DeviceDetail";
import { Devices } from "./pages/Devices";
import { Home } from "./pages/Home";
import { Hygiene } from "./pages/Hygiene";
import { Login } from "./pages/Login";
import { Notifications } from "./pages/Notifications";
import { Planner } from "./pages/Planner";
import { Scans } from "./pages/Scans";
import { Settings } from "./pages/Settings";

function Scene() {
  return <div className="app-scene" aria-hidden />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Scene />
      <div className="app-root">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route index element={<Home />} />
              <Route path="devices" element={<Devices />} />
              <Route path="devices/:id" element={<DeviceDetail />} />
              <Route path="hygiene" element={<Hygiene />} />
              <Route path="planner" element={<Planner />} />
              <Route path="scans" element={<Scans />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
