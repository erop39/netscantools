import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type UiSkin = "classic" | "ops";

const STORAGE_KEY = "netpad_ui_skin";

type UiSkinContextValue = {
  skin: UiSkin;
  setSkin: (skin: UiSkin) => void;
};

const UiSkinContext = createContext<UiSkinContextValue | null>(null);

function readStored(): UiSkin {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "classic" || raw === "ops") return raw;
  } catch {
    /* ignore */
  }
  return "classic";
}

function applySkin(skin: UiSkin) {
  document.documentElement.dataset.ui = skin;
}

export function UiSkinProvider({ children }: { children: ReactNode }) {
  const [skin, setSkinState] = useState<UiSkin>(() => {
    const initial = readStored();
    // apply before paint when possible
    if (typeof document !== "undefined") applySkin(initial);
    return initial;
  });

  const setSkin = useCallback((next: UiSkin) => {
    setSkinState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    applySkin(next);
  }, []);

  useEffect(() => {
    applySkin(skin);
  }, [skin]);

  const value = useMemo(() => ({ skin, setSkin }), [skin, setSkin]);

  return <UiSkinContext.Provider value={value}>{children}</UiSkinContext.Provider>;
}

export function useUiSkin() {
  const ctx = useContext(UiSkinContext);
  if (!ctx) {
    throw new Error("useUiSkin must be used within UiSkinProvider");
  }
  return ctx;
}
