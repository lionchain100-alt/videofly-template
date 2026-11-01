"use client";
import { SiteBrand } from "@/components/site-brand";

import { localePath, siteManifest } from "@/config/site-manifest";

import { siteManifest as siteBrand } from "@/config/site-manifest";

import { useState, useEffect, useTransition } from "react";
import { Menu, Globe, Sun, Moon, Monitor } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useTheme } from "next-themes";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/components/ui";
import { useCredits } from "@/stores/credits-store";
import { headerModels, headerTools, headerDocs } from "@/config/navigation";
import { Gem, ImagePlay, Type, Video, BookOpen } from "lucide-react";
import { LocaleLink } from "@/i18n/navigation";
import type { User } from "@/lib/auth/client";
import { useSigninModal } from "@/hooks/use-signin-modal";
import { authClient } from "@/lib/auth/client";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  ImagePlay,
  Type,
  Video,
};

export function LandingHeader({ user }: { user?: User | null }) {
  const signInModal = useSigninModal();
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [scrolled, setScrolled] = useState(false);
  const { theme, setTheme } = useTheme();

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push(localePath(locale));
    router.refresh();
  };

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Language switcher function
  const switchLocale = (newLocale: string) => {
    startTransition(() => {
      const newPath = localePath(
        newLocale,
        pathname.replace(/^\/(zh|en)(?=\/|$)/, "") || "/",
      );
      router.push(newPath);
      router.refresh(); // Force server components to re-render with new locale
    });
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-background/40 backdrop-blur-xl backdrop-saturate-150 border-b border-white/10 dark:border-white/5 shadow-[0_1px_6px_0_rgba(0,0,0,0.04)]"
          : "bg-transparent",
      )}
    >
      <div className="container mx-auto px-4">
        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center justify-between h-16">
          {/* Logo */}
          <LocaleLink
            href="/"
            className="flex items-center gap-2 text-xl font-semibold"
          >
            <SiteBrand />

            {siteBrand.ui.brand.name}
          </LocaleLink>

          {/* Center Menu - NavigationMenu for better hover */}
          <NavigationMenu className="[--radix-navigation-menu-viewport-width:400px]">
            <NavigationMenuList>
              {/* Models Dropdown (Hidden for audit) */}
              {/* <NavigationMenuItem>
                <NavigationMenuTrigger>{t('Header.models')}</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-[400px] grid-cols-2 gap-2 p-4">
                    {headerModels.map((model) => (
                      <li key={model.id}>
                        <NavigationMenuLink asChild>
                          <LocaleLink
                            href={model.href}
                            className="block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                          >
                            <div className="text-sm font-medium">{model.title}</div>
                            <p className="text-xs text-muted-foreground">
                              {model.subtitle}
                            </p>
                          </LocaleLink>
                        </NavigationMenuLink>
                      </li>
                    ))}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem> */}

              {/* Tools Dropdown */}
              <NavigationMenuItem>
                <NavigationMenuTrigger>
                  {t("Header.tools")}
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="w-48 p-2">
                    {headerTools.map((tool) => {
                      const Icon = iconMap[tool.icon || ""];
                      return (
                        <li key={tool.id}>
                          <NavigationMenuLink asChild>
                            <LocaleLink
                              href={tool.href}
                              className="flex items-center gap-3 rounded-md p-2 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                            >
                              {Icon && <Icon className="h-4 w-4" />}
                              <span className="text-sm">{tool.title}</span>
                            </LocaleLink>
                          </NavigationMenuLink>
                        </li>
                      );
                    })}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>

              {/* Pricing Link */}
              <NavigationMenuItem>
                <NavigationMenuLink asChild>
                  <LocaleLink
                    href="/buy-credits"
                    className={cn(
                      "group inline-flex h-10 w-max items-center justify-center rounded-md bg-transparent px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none",
                    )}
                  >
                    {t("Header.pricing")}
                  </LocaleLink>
                </NavigationMenuLink>
              </NavigationMenuItem>

              {/* Docs Link (Hidden for audit) */}
              {/* <NavigationMenuItem>
                <NavigationMenuLink asChild>
                  <a
                    href={headerDocs.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "group inline-flex h-10 w-max items-center justify-center gap-2 rounded-md bg-transparent px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none"
                    )}
                  >
                    <BookOpen className="h-4 w-4" />
                    {t('Header.docs')}
                  </a>
                </NavigationMenuLink>
              </NavigationMenuItem> */}
            </NavigationMenuList>
          </NavigationMenu>

          {/* Right Section */}
          <div className="flex items-center gap-4">
            {/* Language Switcher */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <Globe className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {locale.toUpperCase()}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-[120px] border-border/50 bg-background/95 backdrop-blur-sm shadow-xl"
              >
                <DropdownMenuItem
                  hidden={!siteManifest.languages.enabled.includes("en")}
                  onClick={() => switchLocale("en")}
                  className="cursor-pointer hover:bg-accent"
                >
                  {locale === "zh" ? "English" : "英文"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  hidden={!siteManifest.languages.enabled.includes("zh")}
                  onClick={() => switchLocale("zh")}
                  className="cursor-pointer hover:bg-accent"
                >
                  {locale === "zh" ? "中文" : "中文"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Theme Toggle */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label="Toggle theme"
                >
                  <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
                  <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-[120px] border-border/50 bg-background/95 backdrop-blur-sm shadow-xl"
              >
                <DropdownMenuItem
                  onClick={() => setTheme("light")}
                  className="cursor-pointer hover:bg-accent"
                >
                  <Sun className="mr-2 h-4 w-4" />
                  Light
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setTheme("dark")}
                  className="cursor-pointer hover:bg-accent"
                >
                  <Moon className="mr-2 h-4 w-4" />
                  Dark
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setTheme("system")}
                  className="cursor-pointer hover:bg-accent"
                >
                  <Monitor className="mr-2 h-4 w-4" />
                  System
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Credits Display */}
            {user && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/80 backdrop-blur-sm border border-border/50">
                <Gem className="h-4 w-4 text-amber-500" />
                <CreditsDisplay />
              </div>
            )}

            {/* User Menu */}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center ring-2 ring-background/20">
                      <span className="text-sm font-medium">
                        {user.name?.[0]?.toUpperCase() ||
                          user.email?.[0]?.toUpperCase()}
                      </span>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-48 border-border/50 bg-background/95 backdrop-blur-sm shadow-xl"
                >
                  <DropdownMenuItem
                    asChild
                    className="cursor-pointer hover:bg-accent"
                  >
                    <LocaleLink href="/my-creations">
                      {t("Header.myCreations")}
                    </LocaleLink>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    asChild
                    className="cursor-pointer hover:bg-accent"
                  >
                    <LocaleLink href="/credits">
                      {t("Header.credits")}
                    </LocaleLink>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    asChild
                    className="cursor-pointer hover:bg-accent"
                  >
                    <LocaleLink href="/settings">
                      {t("Header.settings")}
                    </LocaleLink>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-border/50" />
                  <DropdownMenuItem
                    className="text-destructive cursor-pointer hover:bg-destructive/10"
                    onClick={handleSignOut}
                  >
                    {t("Common.logout")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="default" size="sm" onClick={signInModal.onOpen}>
                {t("Common.login")}
              </Button>
            )}
          </div>
        </nav>

        {/* Mobile Navigation */}
        <div className="lg:hidden flex items-center justify-between h-16">
          {/* Logo */}
          <LocaleLink
            href="/"
            className="flex items-center gap-2 text-lg font-semibold"
          >
            <SiteBrand />

            {siteBrand.ui.brand.name}
          </LocaleLink>

          {/* Mobile Menu */}
          <div className="flex items-center gap-3">
            {/* Credits Display */}
            {user && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted border border-border">
                <Gem className="h-3 w-3 text-amber-500" />
                <span className="text-xs font-medium">
                  <CreditsDisplay />
                </span>
              </div>
            )}

            {/* Sheet Menu */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent className="overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>
                    <LocaleLink href="/" className="flex items-center gap-2">
                      <SiteBrand />

                      {siteBrand.ui.brand.name}
                    </LocaleLink>
                  </SheetTitle>
                </SheetHeader>

                <div className="mt-8 flex flex-col gap-4">
                  <Accordion type="single" collapsible className="w-full">
                    {/* Models (Hidden for audit) */}
                    {/* <AccordionItem value="models" className="border-b-0">
                      <AccordionTrigger className="py-0 font-semibold hover:no-underline">
                        {t('Header.models')}
                      </AccordionTrigger>
                      <AccordionContent className="mt-2">
                        {headerModels.map((model) => (
                          <LocaleLink
                            key={model.id}
                            href={model.href}
                            className="flex flex-col p-3 rounded-md hover:bg-accent transition-colors"
                          >
                            <span className="text-sm font-medium">{model.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {model.subtitle}
                            </span>
                          </LocaleLink>
                        ))}
                      </AccordionContent>
                    </AccordionItem> */}

                    {/* Tools */}
                    <AccordionItem value="tools" className="border-b-0">
                      <AccordionTrigger className="py-0 font-semibold hover:no-underline">
                        {t("Header.tools")}
                      </AccordionTrigger>
                      <AccordionContent className="mt-2">
                        {headerTools.map((tool) => {
                          const Icon = iconMap[tool.icon || ""];
                          return (
                            <LocaleLink
                              key={tool.id}
                              href={tool.href}
                              className="flex items-center gap-3 p-2 rounded-md hover:bg-accent transition-colors"
                            >
                              {Icon && <Icon className="h-4 w-4" />}
                              <span className="text-sm">{tool.title}</span>
                            </LocaleLink>
                          );
                        })}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>

                  {/* Pricing */}
                  <LocaleLink
                    href="/buy-credits"
                    className="font-semibold p-2 hover:bg-accent rounded-md transition-colors"
                  >
                    {t("Header.pricing")}
                  </LocaleLink>

                  {/* Docs (Hidden for audit) */}
                  {/* <a
                    href={headerDocs.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 font-semibold p-2 hover:bg-accent rounded-md transition-colors"
                  >
                    <BookOpen className="h-4 w-4" />
                    {t('Header.docs')}
                  </a> */}

                  {/* Language */}
                  <div className="flex items-center gap-3 p-2">
                    <Globe className="h-4 w-4" />
                    <button
                      hidden={!siteManifest.languages.enabled.includes("en")}
                      onClick={() => switchLocale("en")}
                      className="text-sm hover:text-foreground transition-colors"
                    >
                      {locale === "zh" ? "English" : "英文"}
                    </button>
                    <span className="text-muted-foreground">/</span>
                    <button
                      hidden={!siteManifest.languages.enabled.includes("zh")}
                      onClick={() => switchLocale("zh")}
                      className="text-sm hover:text-foreground transition-colors"
                    >
                      {locale === "zh" ? "中文" : "中文"}
                    </button>
                  </div>

                  {/* Theme Toggle */}
                  <div className="flex items-center gap-2 p-2">
                    <Sun className="h-4 w-4 shrink-0" />
                    <div className="flex items-center gap-1">
                      {(["light", "dark", "system"] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setTheme(mode)}
                          className={cn(
                            "text-sm px-2 py-1 rounded-md transition-colors",
                            theme === mode
                              ? "bg-accent text-accent-foreground font-medium"
                              : "hover:text-foreground text-muted-foreground",
                          )}
                        >
                          {mode === "light"
                            ? "Light"
                            : mode === "dark"
                              ? "Dark"
                              : "System"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Auth Section */}
                <div className="border-t pt-4 mt-4">
                  {user ? (
                    <div className="flex flex-col gap-2">
                      <LocaleLink
                        href="/my-creations"
                        className="p-2 hover:bg-accent rounded-md transition-colors"
                      >
                        {t("Header.myCreations")}
                      </LocaleLink>
                      <LocaleLink
                        href="/credits"
                        className="p-2 hover:bg-accent rounded-md transition-colors"
                      >
                        {t("Header.credits")}
                      </LocaleLink>
                      <LocaleLink
                        href="/settings"
                        className="p-2 hover:bg-accent rounded-md transition-colors"
                      >
                        {t("Header.settings")}
                      </LocaleLink>
                      <button
                        onClick={handleSignOut}
                        className="p-2 text-left text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                      >
                        {t("Common.logout")}
                      </button>
                    </div>
                  ) : (
                    <Button variant="outline" onClick={signInModal.onOpen}>
                      {t("Common.login")}
                    </Button>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}

// Separate component to avoid hydration issues with credits
function CreditsDisplay() {
  const { balance } = useCredits();
  return <span>{balance?.availableCredits ?? 0}</span>;
}
