"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface WindowEventMap {
    beforeinstallprompt: InstallPromptEvent;
  }
}

export function PwaInstall() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Установка не должна влиять на основной conversation flow.
      });
    }

    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !("MSStream" in window);
    const hidden = window.localStorage.getItem("skiller-install-dismissed") === "1";
    queueMicrotask(() => {
      setIsIos(ios && !standalone);
      setDismissed(hidden || standalone);
    });

    const onPrompt = (event: InstallPromptEvent) => {
      event.preventDefault();
      setPrompt(event);
      if (!hidden && !standalone) setDismissed(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (dismissed || (!prompt && !isIos)) return null;

  const close = () => {
    window.localStorage.setItem("skiller-install-dismissed", "1");
    setDismissed(true);
  };

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
    setDismissed(true);
  };

  return (
    <aside
      aria-label="Установка приложения"
      className="fixed bottom-4 left-1/2 z-[100] flex w-[min(92vw,34rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-[#bdcbbf] bg-[#fffef9] px-4 py-3 text-[#173e37] shadow-xl"
    >
      <div className="min-w-0 flex-1 text-sm leading-5">
        <strong className="block">Установить SKILLER</strong>
        <span className="text-[#5e6f68]">
          {isIos ? "Нажмите «Поделиться» → «На экран Домой»." : "Открывайте как обычное приложение."}
        </span>
      </div>
      {prompt ? (
        <button
          type="button"
          onClick={install}
          className="rounded-xl bg-[#173e37] px-3 py-2 text-sm font-semibold text-white"
        >
          Установить
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Закрыть подсказку об установке"
        onClick={close}
        className="rounded-lg px-2 py-2 text-lg"
      >
        ×
      </button>
    </aside>
  );
}
