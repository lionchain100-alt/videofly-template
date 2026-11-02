import { MobileMenuProvider } from "@/components/layout/mobile-menu-context";
import { ToolLayoutContent } from "@/components/layout/tool-layout-content";
import { i18n } from "@/config/i18n-config";
import { getCurrentUser } from "@/lib/auth";
import { headers } from "next/headers";
import { LegacyToolNotice } from "@/components/legacy-tool-notice";

interface ToolLayoutProps {
  children: React.ReactNode;
  params: Promise<{
    locale: string;
  }>;
}

export function generateStaticParams() {
  return i18n.locales.map((locale) => ({ locale }));
}

export default async function ToolLayout({
  children,
  params,
}: ToolLayoutProps) {
  const { locale } = await params;
  if ((await headers()).get("x-ui-home") === "true") return <>{children}</>;
  const user = await getCurrentUser();

  return (
    <MobileMenuProvider>
      <ToolLayoutContent lang={locale} user={user}>
        <LegacyToolNotice locale={locale} />
        {children}
      </ToolLayoutContent>
    </MobileMenuProvider>
  );
}
