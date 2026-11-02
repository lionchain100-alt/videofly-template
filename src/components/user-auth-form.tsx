"use client";
import { localePath } from "@/config/site-manifest";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useTranslations } from "next-intl";

import { authClient } from "@/lib/auth/client";
import { cn } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import * as Icons from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { safeLoginReturn } from "@/lib/auth/production-config";

interface UserAuthFormProps extends React.HTMLAttributes<HTMLDivElement> {
  lang: string;
  disabled?: boolean;
  providers?: { google: boolean; email: boolean };
}

const userAuthSchema = z.object({
  email: z.string().email(),
});

type FormData = z.infer<typeof userAuthSchema>;

export function UserAuthForm({
  className,
  lang,
  disabled,
  providers = { google: false, email: false },
  ...props
}: UserAuthFormProps) {
  const t = useTranslations("Login");
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(userAuthSchema),
  });
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [isGoogleLoading, setIsGoogleLoading] = React.useState<boolean>(false);
  const searchParams = useSearchParams();

  async function onSubmit(data: FormData) {
    setIsLoading(true);

    try {
      const result = await authClient.signIn.magicLink({
        email: data.email.toLowerCase(),
        callbackURL: safeLoginReturn(
          searchParams?.get("from") || null,
          localePath(lang),
        ),
      });
      if (result.error) throw Error("Sign-in unavailable");

      toast.success(lang === "zh" ? "请查看邮箱" : "Check your email", {
        description:
          "We sent you a login link. Be sure to check your spam too.",
      });
    } catch (error) {
      console.error("Error during sign in:", error);
      toast.error("Something went wrong.", {
        description: "Your sign in request failed. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={cn("grid gap-6", className)} {...props}>
      {!providers.google && !providers.email && (
        <output className="block">
          {lang === "zh"
            ? "登录服务尚未配置，请联系站点管理员。"
            : "Sign-in is not configured. Please contact the site administrator."}
        </output>
      )}
      {providers.email && (
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-2">
            <div className="grid gap-1">
              <Label className="sr-only" htmlFor="email">
                Email
              </Label>
              <Input
                id="email"
                placeholder="name@example.com"
                type="email"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect="off"
                disabled={isLoading || isGoogleLoading || disabled}
                {...register("email")}
              />
              {errors?.email && (
                <p className="px-1 text-xs text-red-600">
                  {errors.email.message}
                </p>
              )}
            </div>
            <button
              type="submit"
              className={cn(buttonVariants())}
              disabled={isLoading}
            >
              {isLoading && (
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("signin_email")}
            </button>
          </div>
        </form>
      )}
      {providers.email && providers.google && (
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              {t("signin_others")}
            </span>
          </div>
        </div>
      )}
      {providers.google && (
        <button
          type="button"
          className={cn(buttonVariants({ variant: "outline" }))}
          onClick={() => {
            setIsGoogleLoading(true);
            authClient.signIn
              .social({
                provider: "google",
                callbackURL: safeLoginReturn(
                  searchParams?.get("from") || null,
                  localePath(lang),
                ),
              })
              .then((r) => {
                if (r.error) {
                  setIsGoogleLoading(false);
                  toast.error(
                    lang === "zh" ? "登录暂不可用" : "Sign-in unavailable",
                  );
                }
              })
              .catch((error) => {
                console.error("Google signIn error:", error);
                setIsGoogleLoading(false);
              });
          }}
          disabled={isLoading || isGoogleLoading}
        >
          {isGoogleLoading ? (
            <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Icons.Google className="mr-2 h-4 w-4" />
          )}{" "}
          {lang === "zh" ? "使用 Google 登录" : "Continue with Google"}
        </button>
      )}
    </div>
  );
}
