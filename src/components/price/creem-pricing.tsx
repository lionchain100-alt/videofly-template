"use client";
import { siteManifest as siteBrand } from "@/config/site-manifest";

import { useEffect, useMemo, useState, useTransition } from "react";
import Balancer from "react-wrap-balancer";

import { creem } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import * as Icons from "@/components/ui/icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui";
import { toast } from "sonner";
import { Check } from "lucide-react";

import { useSigninModal } from "@/hooks/use-signin-modal";
import {
  canPurchasePackages,
  getLocalizedOnetimePackages,
  getLocalizedSubscriptionPackages,
  type CreditsDictionary,
  type LocalizedPackage,
} from "@/hooks/use-credit-packages";

interface CreemPricingProps {
  userId?: string;
  dictPrice: Record<string, string>;
  dictCredits: CreditsDictionary;
}

type PricingTab = "onetime" | "monthly" | "yearly";

function formatPrice(cents: number): string {
  const value = (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
  return `$${value}`;
}

// 计算年付折扣（年付 = 月付 × 10，买 10 送 2）
function calculateYearlyDiscount(): string {
  // 月付12个月 vs 年付10个月的价格
  // 折扣 = (12 - 10) / 12 = 16.67% ≈ 17%
  return "17% OFF";
}

export function CreemPricing({
  userId,
  dictPrice,
  dictCredits,
}: CreemPricingProps) {
  const [activeTab, setActiveTab] = useState<PricingTab>("onetime");
  const [hasAccess, setHasAccess] = useState(false);
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [loadingProductId, setLoadingProductId] = useState<string | null>(null);
  const signInModal = useSigninModal();

  // 组织产品数据
  const allSubscriptionProducts = useMemo(
    () =>
      getLocalizedSubscriptionPackages(dictCredits).sort(
        (a, b) => a.credits - b.credits,
      ),
    [dictCredits],
  );

  const onetimeProducts = useMemo(
    () =>
      getLocalizedOnetimePackages(dictCredits).sort(
        (a, b) => a.credits - b.credits,
      ),
    [dictCredits],
  );

  const monthlyProducts = useMemo(
    () => allSubscriptionProducts.filter((p) => p.billingPeriod === "month"),
    [allSubscriptionProducts],
  );

  const yearlyProducts = useMemo(
    () => allSubscriptionProducts.filter((p) => p.billingPeriod === "year"),
    [allSubscriptionProducts],
  );

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setIsCheckingAccess(true);

    creem
      .hasAccessGranted()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error("Creem access check failed:", error);
          return;
        }
        const subscription =
          data && "subscription" in data ? data.subscription : undefined;
        setHasAccess(!!data?.hasAccessGranted);
        setActiveProductId(subscription?.productId ?? null);
      })
      .finally(() => {
        if (active) setIsCheckingAccess(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const handleCheckout = (product: LocalizedPackage) => {
    if (!userId) {
      signInModal.onOpen();
      return;
    }

    setLoadingProductId(product.id);
    startTransition(async () => {
      const origin = window.location.origin;
      // 支付成功后跳转到 credits 页面，同时将当前页面作为 returnTo 参数
      const currentPath = window.location.pathname;
      const returnTo = encodeURIComponent(currentPath);
      const { data, error } = await creem.createCheckout({
        productId: product.id,
        successUrl: `${origin}/credits?payment=success&returnTo=${returnTo}`,
        metadata: {
          plan: product.id,
        },
      });

      if (error) {
        toast.error("Checkout error", {
          description: error.message ?? "Failed to create checkout session.",
        });
        setLoadingProductId(null);
        return;
      }

      if (!data || !("url" in data) || !data.url) {
        toast.error("Checkout error", {
          description: "Missing checkout URL from Creem.",
        });
        setLoadingProductId(null);
        return;
      }

      window.location.href = data.url;
    });
  };
  const buyCreditsLabel = dictCredits.buy_credits ?? "Buy Credits";

  const handlePortal = async () => {
    const { data, error } = await creem.createPortal();
    if (error) {
      toast.error("Portal error", {
        description: error.message ?? "Failed to open customer portal.",
      });
      return;
    }

    if (!data || !("url" in data) || !data.url) {
      toast.error("Portal error", {
        description: "Missing portal URL from Creem.",
      });
      return;
    }

    window.location.href = data.url;
  };

  return (
    <section className="container py-12 md:py-20">
      {/* 标题区 */}
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-muted-foreground">
          {dictPrice.pricing}
        </p>
        <h2 className="font-heading text-3xl leading-[1.1] md:text-5xl">
          {dictPrice.slogan}
        </h2>
        <p className="mt-4 text-muted-foreground">
          选择适合您的积分方案，灵活满足不同需求
        </p>
      </div>

      {/* Tab 切换 */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as PricingTab)}
        className="w-full"
      >
        <TabsList className="mx-auto grid max-w-2xl grid-cols-3">
          <TabsTrigger value="onetime">一次性积分包</TabsTrigger>
          <TabsTrigger value="monthly">按月订阅</TabsTrigger>
          <TabsTrigger value="yearly" className="relative">
            按年订阅
            <Badge className="absolute -top-2 -right-2 h-5 px-2 bg-destructive text-xs">
              {calculateYearlyDiscount()}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* 一次性积分包 */}
        <TabsContent value="onetime" className="mt-8">
          <PricingGrid
            products={onetimeProducts}
            activeProductId={activeProductId}
            hasAccess={hasAccess}
            userId={userId}
            isPending={isPending}
            isCheckingAccess={isCheckingAccess}
            loadingProductId={loadingProductId}
            isOnetime={true}
            dictPrice={dictPrice}
            dictCredits={dictCredits}
            onCheckout={handleCheckout}
            onPortal={handlePortal}
            signInModal={signInModal}
          />
        </TabsContent>

        {/* 按月订阅 */}
        <TabsContent value="monthly" className="mt-8">
          <PricingGrid
            products={monthlyProducts}
            activeProductId={activeProductId}
            hasAccess={hasAccess}
            userId={userId}
            isPending={isPending}
            isCheckingAccess={isCheckingAccess}
            loadingProductId={loadingProductId}
            isOnetime={false}
            dictPrice={dictPrice}
            dictCredits={dictCredits}
            onCheckout={handleCheckout}
            onPortal={handlePortal}
            signInModal={signInModal}
          />
        </TabsContent>

        {/* 按年订阅 */}
        <TabsContent value="yearly" className="mt-8">
          <PricingGrid
            products={yearlyProducts}
            activeProductId={activeProductId}
            hasAccess={hasAccess}
            userId={userId}
            isPending={isPending}
            isCheckingAccess={isCheckingAccess}
            loadingProductId={loadingProductId}
            isOnetime={false}
            dictPrice={dictPrice}
            dictCredits={dictCredits}
            onCheckout={handleCheckout}
            onPortal={handlePortal}
            signInModal={signInModal}
          />
        </TabsContent>
      </Tabs>

      {/* 底部联系信息 */}
      <p className="mt-16 text-center text-base text-muted-foreground">
        <Balancer>
          Email{" "}
          <a
            className="font-medium text-primary hover:underline"
            href={`mailto:${siteBrand.contact.supportEmail}`}
          >
            {siteBrand.contact.supportEmail}
          </a>{" "}
          {dictPrice.contact}
          <br />
          <strong>{dictPrice.contact_2}</strong>
        </Balancer>
      </p>
    </section>
  );
}

// ============================================
// PricingGrid Component
// ============================================

interface PricingGridProps {
  products: LocalizedPackage[];
  activeProductId: string | null;
  hasAccess: boolean;
  userId?: string;
  isPending: boolean;
  isCheckingAccess: boolean;
  loadingProductId: string | null;
  isOnetime: boolean;
  dictPrice: Record<string, string>;
  dictCredits: CreditsDictionary;
  onCheckout: (product: LocalizedPackage) => void;
  onPortal: () => void;
  signInModal: { onOpen: () => void };
}

function PricingGrid({
  products,
  activeProductId,
  hasAccess,
  userId,
  isPending,
  isCheckingAccess,
  loadingProductId,
  isOnetime,
  dictPrice,
  dictCredits,
  onCheckout,
  onPortal,
  signInModal,
}: PricingGridProps) {
  const buyCreditsLabel = dictCredits.buy_credits ?? "Buy Credits";

  if (products.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        暂无可用产品
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
      {products.map((product, index) => {
        const isRecommended = product.popular; // 使用产品配置的 popular 字段
        const isCurrent = activeProductId === product.id && hasAccess;
        const isLoading = loadingProductId === product.id;
        const isFreeUserAccessible =
          isOnetime && product.allowFreeUser === true;

        return (
          <Card
            key={product.id}
            className={cn(
              "flex flex-col transition-shadow hover:shadow-lg",
              isRecommended && "border-primary border-2 relative",
            )}
          >
            {/* 推荐标签 - 更醒目 */}
            {isRecommended && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 bg-linear-gradient-to-r from-primary to-primary/80 px-3 py-1 text-sm font-semibold shadow-md">
                ⭐ 推荐
              </Badge>
            )}

            <CardHeader className={cn("pb-4", isRecommended && "pt-6")}>
              <div className="flex items-start justify-between">
                <CardTitle className="text-lg">{product.displayName}</CardTitle>
                {/* 免费用户可买标签 */}
                {isFreeUserAccessible && (
                  <Badge variant="secondary" className="text-xs">
                    免费用户可买
                  </Badge>
                )}
              </div>

              <div className="mt-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">
                    {formatPrice(product.price.amount)}
                  </span>
                  {product.billingPeriod && (
                    <span className="text-muted-foreground text-sm">
                      /{product.billingPeriod === "year" ? "年" : "月"}
                    </span>
                  )}
                </div>
              </div>

              {product.displayDescription && (
                <CardDescription>{product.displayDescription}</CardDescription>
              )}
            </CardHeader>

            <CardContent className="flex-1">
              <ul className="space-y-3">
                {product.localizedFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>

            <CardFooter>
              {userId ? (
                isCurrent ? (
                  <Button
                    variant="default"
                    className="w-full"
                    onClick={onPortal}
                  >
                    {dictPrice.manage_subscription}
                  </Button>
                ) : (
                  <Button
                    variant={isRecommended ? "default" : "outline"}
                    className="w-full relative"
                    disabled={isLoading || isCheckingAccess}
                    onClick={() => onCheckout(product)}
                  >
                    {isLoading ? (
                      <span className="flex items-center justify-center">
                        <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                        处理中...
                      </span>
                    ) : product.billingPeriod ? (
                      dictPrice.upgrade
                    ) : (
                      buyCreditsLabel
                    )}
                  </Button>
                )
              ) : (
                <Button
                  variant={isRecommended ? "default" : "outline"}
                  onClick={signInModal.onOpen}
                >
                  {dictPrice.signup}
                </Button>
              )}
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
