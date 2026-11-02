"use client";

import { useMemo, useState, useTransition } from "react";
import Balancer from "react-wrap-balancer";
import { IconCheck, IconX } from "@tabler/icons-react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { creem } from "@/lib/auth/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import * as Icons from "@/components/ui/icons";

import { useSigninModal } from "@/hooks/use-signin-modal";
import {
  getLocalizedOnetimePackages,
  getLocalizedSubscriptionPackages,
  type CreditsDictionary,
  type LocalizedPackage,
} from "@/hooks/use-credit-packages";
import { useCredits } from "@/stores/credits-store";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface DarkPricingProps {
  userId?: string;
  dictPrice: Record<string, string>;
  dictCredits: CreditsDictionary;
}

type PricingTab = "onetime" | "monthly" | "yearly";
type FeatureItem = {
  text: string;
  included: boolean;
};

function formatPrice(cents: number): string {
  const value = (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
  return `$${value}`;
}

// 定义标准功能列表（所有产品功能的并集）
function getStandardFeatures(products: LocalizedPackage[]): FeatureItem[] {
  // 收集所有产品的功能
  const allFeatures = products.flatMap(p => p.localizedFeatures);
  // 去重
  const uniqueFeatures = Array.from(new Set(allFeatures));

  return uniqueFeatures.map(feature => ({
    text: feature,
    included: false, // 默认为 false，每个产品会自己设置
  }));
}

export function DarkPricing({
  userId,
  dictPrice,
  dictCredits,
}: DarkPricingProps) {
  const t = useTranslations("PricingCards");
  const [activeTab, setActiveTab] = useState<PricingTab>("monthly");
  const [hasAccess, setHasAccess] = useState(false);
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const signInModal = useSigninModal();
  const { balance } = useCredits();
  const userPlan = balance?.plan || "FREE";
  const isFreeUser = !userPlan || userPlan === "FREE";

  // 组织产品数据
  const allSubscriptionProducts = useMemo(
    () =>
      getLocalizedSubscriptionPackages(dictCredits).sort(
        (a, b) => a.credits - b.credits
      ),
    [dictCredits]
  );

  const onetimeProducts = useMemo(
    () =>
      getLocalizedOnetimePackages(dictCredits).sort(
        (a, b) => a.credits - b.credits
      ),
    [dictCredits]
  );

  const monthlyProducts = useMemo(
    () => allSubscriptionProducts.filter((p) => p.billingPeriod === "month"),
    [allSubscriptionProducts]
  );

  const yearlyProducts = useMemo(
    () => allSubscriptionProducts.filter((p) => p.billingPeriod === "year"),
    [allSubscriptionProducts]
  );

  const handleCheckout = (product: LocalizedPackage) => {
    if (!userId) {
      signInModal.onOpen();
      return;
    }

    startTransition(async () => {
      const origin = window.location.origin;
      // 支付成功后跳转到 credits 页面
      // 如果当前不在 pricing 页面（例如嵌入在其他页面的弹窗），则设置 returnTo 以便跳回
      // 如果本来就在 pricing 页面，则不设置 returnTo，让用户停留在 credits 页面查看余额
      const currentPath = window.location.pathname;
      const isPricingPage = currentPath.includes("/pricing");
      const returnTo = isPricingPage ? "" : encodeURIComponent(currentPath);

      const successUrl = returnTo
        ? `${origin}/credits?payment=success&returnTo=${returnTo}`
        : `${origin}/credits?payment=success`;

      const { data, error } = await creem.createCheckout({
        productId: product.id,
        successUrl,
        metadata: {
          plan: product.id,
        },
      });

      if (error) {
        toast.error("Checkout error", {
          description: error.message ?? "Failed to create checkout session.",
        });
        return;
      }

      if (!data || !("url" in data) || !data.url) {
        toast.error("Checkout error", {
          description: "Missing checkout URL from Creem.",
        });
        return;
      }

      window.location.href = data.url;
    });
  };

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

  // 获取当前 tab 的产品
  const getCurrentProducts = () => {
    switch (activeTab) {
      case "onetime":
        return onetimeProducts;
      case "monthly":
        return monthlyProducts;
      case "yearly":
        return yearlyProducts;
      default:
        return [];
    }
  };

  const currentProducts = getCurrentProducts();
  const buyCreditsLabel = dictCredits.buy_credits ?? "Buy Credits";

  // 计算标准功能列表（所有产品的功能并集）
  const standardFeatures = useMemo(() => {
    return getStandardFeatures(currentProducts);
  }, [currentProducts]);

  return (
    <section className="flex flex-col items-center text-center py-6 md:py-6">
      {/* Tab 切换 */}
      <div className="mb-6 mx-auto flex justify-center">
        <div className="inline-flex rounded-lg bg-muted p-1">
          <TabButton
            active={activeTab === "onetime"}
            onClick={() => setActiveTab("onetime")}
          >
            {t("onetime")}
          </TabButton>
          <TabButton
            active={activeTab === "monthly"}
            onClick={() => setActiveTab("monthly")}
          >
            {t("monthly")}
          </TabButton>
          <TabButton
            active={activeTab === "yearly"}
            onClick={() => setActiveTab("yearly")}
            showBadge
          >
            {t("yearly")}
            <span className="ml-1.5 rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
              20% OFF
            </span>
          </TabButton>
        </div>
      </div>

      {/* 价格卡片 */}
      {currentProducts.length > 0 ? (
        <div className="mx-auto grid gap-5 bg-inherit py-5 md:grid-cols-[repeat(3,minmax(0,360px))] justify-center">
          {currentProducts.map((product, index) => {
            const isRecommended = product.popular === true;
            const isCurrent = activeProductId === product.id && hasAccess;

            // 为每个产品生成对齐后的功能列表
            const alignedFeatures = standardFeatures.map(feature => ({
              ...feature,
              included: product.localizedFeatures.some(f => f === feature.text),
            }));

            // 检查是否允许免费用户购买
            const isRestricted = isFreeUser && product.allowFreeUser === false;

            return (
              <PricingCard
                key={product.id}
                product={product}
                features={alignedFeatures}
                isRecommended={isRecommended}
                isCurrent={isCurrent}
                userId={userId}
                isPending={isPending}
                isRestricted={isRestricted} // Pass restriction status
                buyCreditsLabel={buyCreditsLabel}
                dictPrice={dictPrice}
                dictCredits={dictCredits}
                onCheckout={handleCheckout}
                onPortal={handlePortal}
                signInModal={signInModal}
              />
            );
          })}
        </div>
      ) : (
        <div className="py-12 text-center text-muted-foreground">
          {t("no_products")}
        </div>
      )}
    </section>
  );
}

// ============================================
// Tab Button Component
// ============================================

interface TabButtonProps {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  showBadge?: boolean;
}

function TabButton({ active, children, onClick, showBadge }: TabButtonProps) {
  return (
    <button type="button"
      onClick={onClick}
      className={cn(
        "relative rounded-md px-6 py-2.5 text-sm font-semibold transition-all duration-200",
        !showBadge && "pr-6",
        active
          ? "bg-primary text-primary-foreground shadow-md scale-105"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

// ============================================
// Pricing Card Component
// ============================================

interface PricingCardProps {
  product: LocalizedPackage;
  features: FeatureItem[];
  isRecommended: boolean;
  isCurrent: boolean;
  userId?: string;
  isPending: boolean;
  buyCreditsLabel: string;
  dictPrice: Record<string, string>;
  dictCredits: CreditsDictionary;
  onCheckout: (product: LocalizedPackage) => void;
  onPortal: () => void;
  signInModal: { onOpen: () => void };
  isRestricted?: boolean;
}

function PricingCard({
  product,
  features,
  isRecommended,
  isCurrent,
  userId,
  isPending,
  buyCreditsLabel,
  dictPrice,
  dictCredits,
  onCheckout,
  onPortal,
  signInModal,
  isRestricted = false,
}: PricingCardProps) {
  const t = useTranslations("PricingCards");

  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-xl border transition-all duration-200",
        isRecommended
          ? "border-primary shadow-lg z-10 bg-secondary/5"
          : "border-border bg-card hover:bg-muted/10"
      )}
    >
      {isRecommended && (
        <div className="absolute top-0 right-0 left-0 h-1 bg-primary" />
      )}
      <div className={cn(
        "min-h-[150px] items-start space-y-4 p-6",
        isRecommended ? "bg-secondary/40" : "bg-secondary/20"
      )}>
        <p className="font-urban flex text-sm font-bold uppercase tracking-wider text-muted-foreground">
          {product.displayName}
        </p>

        <div className="flex flex-row">
          <div className="flex items-end gap-2">
            <div className="flex text-left text-3xl font-semibold leading-6">
              {formatPrice(product.price.amount)}
            </div>
            <div className="-mb-1 ml-2 text-left text-sm font-medium text-muted-foreground">
              {product.billingPeriod ? (product.billingPeriod === "year" ? t("per_year") : t("per_month")) : ""}
            </div>
          </div>
        </div>

        {/* 显示积分数 */}
        {product.credits && (
          <div className="text-left text-sm text-muted-foreground">
            {dictCredits.title || "Credits"}: {product.credits.toLocaleString()}
          </div>
        )}

        {product.displayDescription ? (
          <div className="text-left text-sm text-muted-foreground">
            {product.displayDescription}
          </div>
        ) : null}
      </div>

      <div className="flex h-full flex-col justify-between gap-10 p-6">
        <ul className="space-y-2 text-left text-sm font-medium leading-normal">
          {features.map((feature, idx) => (
            <li className="flex items-start" key={idx}>
              {feature.included ? (
                <Icons.Check className="mr-3 h-5 w-5 shrink-0 text-primary" />
              ) : (
                <Icons.Close className="mr-3 h-5 w-5 shrink-0 text-destructive" />
              )}
              <p className={cn(feature.included ? "text-foreground" : "text-muted-foreground")}>
                {feature.text}
              </p>
            </li>
          ))}
        </ul>

        {userId ? (
          isCurrent ? (
            <button type="button"
              onClick={onPortal}
              className={cn(
                "w-full rounded-lg py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2",
                "hover:opacity-90",
                isRecommended
                  ? "bg-primary text-primary-foreground"
                  : "border border-primary bg-transparent text-primary hover:bg-primary hover:text-primary-foreground"
              )}
            >
              {dictPrice.manage_subscription}
            </button>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="w-full">
                    <button type="button"
                      disabled={isPending || isRestricted}
                      onClick={() => onCheckout(product)}
                      className={cn(
                        "w-full rounded-lg py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        "hover:opacity-90",
                        isRecommended
                          ? "bg-primary text-primary-foreground"
                          : "border border-primary bg-transparent text-primary hover:bg-primary hover:text-primary-foreground"
                      )}
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : isRestricted ? (
                        "Subscribers Only"
                      ) : product.billingPeriod ? (
                        dictPrice.upgrade
                      ) : (
                        buyCreditsLabel
                      )}
                    </button>
                  </span>
                </TooltipTrigger>
                {isRestricted && (
                  <TooltipContent>
                    <p>This pack is only available to active subscribers.</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          )
        ) : (
          <button type="button"
            onClick={signInModal.onOpen}
            className={cn(
              "w-full rounded-lg py-2.5 text-sm font-semibold transition-colors",
              "hover:opacity-90",
              isRecommended
                ? "bg-primary text-primary-foreground"
                : "border border-primary bg-transparent text-primary hover:bg-primary hover:text-primary-foreground"
            )}
          >
            {dictPrice.signup}
          </button>
        )}
      </div>
    </div>
  );
}
