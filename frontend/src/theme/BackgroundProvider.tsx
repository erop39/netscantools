import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "../api/client";
import type { Settings, UiBackground } from "../types";

const STORAGE_KEY = "netpad_ui_background";

type BackgroundContextValue = {
  uiBackground: UiBackground;
  backgroundUrl: string | null;
  setAppearance: (uiBackground: UiBackground, backgroundUrl: string | null) => void;
  refreshFromApi: () => Promise<void>;
};

const BackgroundContext = createContext<BackgroundContextValue | null>(null);

function readStored(): UiBackground {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === "default" || raw === "solid" || raw === "gradient" || raw === "custom") {
    return raw;
  }
  return "default";
}

function applyScene(uiBackground: UiBackground, backgroundUrl: string | null) {
  const root = document.documentElement;
  root.dataset.bg = uiBackground;

  let url = backgroundUrl;
  if (uiBackground === "default" && !url) {
    url = "/bg.jpg";
  }
  if (uiBackground === "custom" && !url) {
    url = "/api/settings/background-image";
  }
  if (uiBackground === "solid" || uiBackground === "gradient") {
    url = null;
  }

  if (url) {
    root.style.setProperty("--scene-image", `url("${url}")`);
  } else {
    root.style.setProperty("--scene-image", "none");
  }
}

export function BackgroundProvider({ children }: { children: ReactNode }) {
  const [uiBackground, setUiBackground] = useState<UiBackground>(() => readStored());
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(() =>
    readStored() === "default" ? "/bg.jpg" : readStored() === "custom" ? "/api/settings/background-image" : null,
  );

  const setAppearance = useCallback((next: UiBackground, url: string | null) => {
    setUiBackground(next);
    setBackgroundUrl(url);
    localStorage.setItem(STORAGE_KEY, next);
    applyScene(next, url);
  }, []);

  const refreshFromApi = useCallback(async () => {
    try {
      const s = await apiFetch<Settings>("/api/settings");
      setAppearance(s.ui_background, s.ui_background_url);
    } catch {
      // keep local preference (e.g. on login page)
    }
  }, [setAppearance]);

  useEffect(() => {
    applyScene(uiBackground, backgroundUrl);
  }, [uiBackground, backgroundUrl]);

  const value = useMemo(
    () => ({ uiBackground, backgroundUrl, setAppearance, refreshFromApi }),
    [uiBackground, backgroundUrl, setAppearance, refreshFromApi],
  );

  return <BackgroundContext.Provider value={value}>{children}</BackgroundContext.Provider>;
}

export function useBackground() {
  const ctx = useContext(BackgroundContext);
  if (!ctx) {
    throw new Error("useBackground must be used within BackgroundProvider");
  }
  return ctx;
}
