import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applySettings, getSettings } from "../stores/settings";
import { Site } from "./Site";
import "../styles/styles.css";
import "../styles/home.css";
import "../styles/workspace.css";

// The settings set the theme before the first paint, so the page does not flash.
applySettings(getSettings());

// PV-01: the production build starts offline from the app shell. The dev server
// stays uncached, so a change is always the change that you see.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("The app has no root element.");
}

createRoot(root).render(
  <StrictMode>
    <Site />
  </StrictMode>,
);
