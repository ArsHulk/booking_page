"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function HomeScreenButton() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const iosStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setInstalled(standalone || iosStandalone);
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }

    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setShowHelp(false);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function saveToHomeScreen() {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setInstallPrompt(null);
      return;
    }
    setShowHelp((current) => !current);
  }

  if (installed) return null;

  return (
    <div className="home-screen-control">
      <button className="home-screen-button" type="button" onClick={() => void saveToHomeScreen()} aria-expanded={showHelp}>
        <span aria-hidden="true">＋</span> Save to phone
      </button>
      {showHelp ? (
        <div className="home-screen-help" role="status">
          {isIos
            ? "In Safari, tap Share, then Add to Home Screen."
            : "Open your browser menu and choose Install app or Add to Home screen."}
        </div>
      ) : null}
    </div>
  );
}
