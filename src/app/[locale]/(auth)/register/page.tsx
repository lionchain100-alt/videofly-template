import { localePath } from "@/config/site-manifest";
import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { cn } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";

import {productionAuthConfig}from"@/lib/auth/production-config";
import { UserAuthForm } from "@/components/user-auth-form";
import type { Locale } from "@/config/i18n-config";

export const metadata = {
  title: "Create an account",
  description: "Create an account to get started.",
};

export default async function RegisterPage({
  params,
}: {
  params: Promise<{
    locale: Locale;
  }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("Login");

  return (
    <div className="container grid h-screen w-screen flex-col items-center justify-center lg:max-w-none lg:grid-cols-2 lg:px-0">
      <Link
        href={localePath(locale, `/login`)}
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "absolute right-4 top-4 md:right-8 md:top-8",
        )}
      >
        {t("back")}
      </Link>
      <div className="hidden h-full bg-muted lg:block" />
      <div className="lg:p-8">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <div className="flex flex-col space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("create_account")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("create_account_desc")}
            </p>
          </div>
          <Suspense fallback={<div className="h-10" />}>
            <UserAuthForm lang={locale} providers={productionAuthConfig()} />
          </Suspense>
          <p className="px-8 text-center text-sm text-muted-foreground">
            {t("agree_prefix")}{" "}
            <Link
              href={localePath(locale, `/terms`)}
              className="hover:text-brand underline underline-offset-4"
            >
              {t("terms_of_service")}
            </Link>{" "}
            {t("and")}{" "}
            <Link
              href={localePath(locale, `/privacy`)}
              className="hover:text-brand underline underline-offset-4"
            >
              {t("privacy_policy")}
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
