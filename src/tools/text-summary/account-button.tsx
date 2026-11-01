"use client";
import { localePath } from "@/config/site-manifest";

import { useEffect, useState } from "react";
import { useCreditsStore } from "@/stores/credits-store";
import styles from "@/ui-presets/site.module.css";

export function AccountButton({ locale }: { locale: "zh" | "en" }) {
  const [authenticated, setAuthenticated] = useState(false);
  const balance = useCreditsStore((state) => state.balance);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/v1/credit/balance", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          if (!cancelled) useCreditsStore.getState().reset();
          return;
        }
        if (!response.ok) return;
        const { data } = await response.json();
        if (!cancelled) {
          useCreditsStore.getState().setBalance(data);
          setAuthenticated(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <button
      type="button"
      className={styles.secondary}
      onClick={() =>
        window.location.assign(
          localePath(locale, authenticated ? "/credits" : "/login"),
        )
      }
    >
      {authenticated
        ? `${locale === "zh" ? "账户" : "Account"} · ${balance?.availableCredits ?? "…"} ${locale === "zh" ? "积分" : "credits"}`
        : locale === "zh"
          ? "登录"
          : "Sign in"}
    </button>
  );
}
