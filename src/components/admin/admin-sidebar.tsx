"use client";
import { siteManifest } from "@/config/site-manifest";
import { localePath } from "@/config/site-manifest";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/components/ui";
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Settings,
  ArrowLeft,
} from "@/components/ui/icons";

interface AdminSidebarProps {
  locale: string;
}

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  {
    title: "概览",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    title: "用户管理",
    href: "/admin/users",
    icon: Users,
  },
  {
    title: "任务列表",
    href: "/admin/tasks",
    icon: LayoutDashboard,
  },
  {
    title: "积分流水",
    href: "/admin/credits",
    icon: BarChart3,
  },
  { title: "充值订单", href: "/admin/orders", icon: BarChart3 },
  { title: "支付异常", href: "/admin/payments", icon: BarChart3 },
  { title: "运行状态", href: "/admin/runtime", icon: BarChart3 },
  { title: "模型与费用", href: "/admin/ai", icon: BarChart3 },
  {
    title: "数据分析",
    href: "/admin/analytics",
    icon: BarChart3,
  },
  {
    title: "系统设置",
    href: "/admin/settings",
    icon: Settings,
  },
];

export function AdminSidebar({ locale }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-16 shrink-0 border-r bg-card md:w-56">
      <div className="flex h-full flex-col">
        {/* Brand */}
        <div className="flex h-16 items-center border-b px-4 md:px-6">
          <Link
            href={localePath(locale, `/admin`)}
            className="flex items-center gap-2"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">
                {siteManifest.ui.brand.mark}
              </span>
            </div>
            <span className="hidden text-lg font-semibold md:inline">
              {siteManifest.ui.brand.name}
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-2 md:p-4">
          {navItems.map((item) => {
            // 规范化路径进行比较（移除尾部斜杠）
            const normalizedPathname = pathname.replace(/\/$/, "");
            const normalizedHref = localePath(locale, `${item.href}`).replace(
              /\/$/,
              "",
            );
            const isActive =
              normalizedPathname === normalizedHref ||
              (item.href !== "/admin" &&
                normalizedPathname.startsWith(`${normalizedHref}/`));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                aria-label={item.title}
                title={item.title}
                href={localePath(locale, `${item.href}`)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden md:inline">{item.title}</span>
              </Link>
            );
          })}
        </nav>

        {/* Back to App */}
        <div className="border-t p-2 md:p-4">
          <Link
            aria-label="返回网站"
            title="返回网站"
            href={locale === "en" ? "/" : localePath(locale, `/`)}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden md:inline">返回网站</span>
          </Link>
        </div>
      </div>
    </aside>
  );
}
