import { Suspense } from "react";
import { headers } from "next/headers";

import { getCurrentUser } from "@/lib/auth";

import { ModalProvider } from "@/components/modal-provider";
import { LandingHeader } from "@/components/landing/header";
import { LandingFooter } from "@/components/landing/footer";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if ((await headers()).get("x-ui-home") === "true") return <>{children}</>;
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-screen flex-col">
      {/* 全局渐变背景 - 所有营销页面共享 */}
      <div className="fixed inset-0 -z-20">
        <div className="absolute inset-0 dark:bg-[#0a0f0d] bg-background" />
        <div
          className="absolute inset-0 hidden dark:block"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(16, 185, 129, 0.25), transparent 70%)",
          }}
        />
        <div
          className="absolute inset-0 dark:hidden"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at top, oklch(from var(--primary) l c h / 0.15), var(--background) 70%)",
          }}
        />
      </div>

      <Suspense fallback={<div className="h-16 border-b" />}>
        <LandingHeader user={user ?? null} />
      </Suspense>

      <ModalProvider>
        <main className="flex-1">{children}</main>
      </ModalProvider>

      <LandingFooter />
    </div>
  );
}
