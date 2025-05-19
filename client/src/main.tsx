import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";

// Custom styles for Telegram theming
const setTelegramTheme = () => {
  const root = document.documentElement;
  
  // Get Telegram theme variables if they exist
  const tgBgColor = window.Telegram?.WebApp?.backgroundColor || "#f8f9fa";
  const tgTextColor = window.Telegram?.WebApp?.textColor || "#000000";
  const tgButtonColor = window.Telegram?.WebApp?.buttonColor || "#0088CC";
  const tgButtonTextColor = window.Telegram?.WebApp?.buttonTextColor || "#ffffff";

  // Apply Telegram theme variables as CSS variables
  root.style.setProperty("--tg-theme-bg-color", tgBgColor);
  root.style.setProperty("--tg-theme-text-color", tgTextColor);
  root.style.setProperty("--tg-theme-button-color", tgButtonColor);
  root.style.setProperty("--tg-theme-button-text-color", tgButtonTextColor);
};

// Initialize Telegram theme
setTelegramTheme();

// Mount React app
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);
