import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { BackgroundProvider } from "./theme/BackgroundProvider";
import { UiSkinProvider } from "./theme/UiSkinProvider";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <UiSkinProvider>
      <BackgroundProvider>
        <App />
      </BackgroundProvider>
    </UiSkinProvider>
  </StrictMode>,
);
