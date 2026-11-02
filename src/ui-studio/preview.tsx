"use client";
import { useEffect, useRef, useState } from "react";
import { SiteRenderer } from "@/ui-presets/site-renderer";
import { uiConfigSchema, type DemoState, type UIConfig } from "@/ui-presets/config";

export function StudioPreview({ initialConfig }: { initialConfig: UIConfig }) {
  const [config, setConfig] = useState(initialConfig);
  const [locale, setLocale] = useState<"zh" | "en">("zh");
  const [scenario, setScenario] = useState<DemoState>("empty");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== window.parent ||
        event.data?.type !== "laconic:config"
      )
        return;
      const parsed = uiConfigSchema.safeParse(event.data.config);
      if (
        !parsed.success ||
        !["zh", "en"].includes(event.data.locale) ||
        !["empty", "loading", "success", "error", "credits", "signed-out"].includes(
          event.data.scenario,
        )
      )
        return;
      setConfig(parsed.data);
      setLocale(event.data.locale);
      setScenario(event.data.scenario);
    };
    window.addEventListener("message", receive);
    window.parent.postMessage({ type: "laconic:ready" }, window.location.origin);
    const observer = new ResizeObserver(() => {
      if (root.current)
        window.parent.postMessage(
          {
            type: "laconic:height",
            height: Math.ceil(root.current.getBoundingClientRect().height),
          },
          window.location.origin,
        );
    });
    if (root.current) observer.observe(root.current);
    return () => {
      window.removeEventListener("message", receive);
      observer.disconnect();
    };
  }, []);
  return (
    <div ref={root}>
      <SiteRenderer config={config} locale={locale} scenario={scenario} preview />
    </div>
  );
}
