"use client";

// ============================================
// Credits Page
// ============================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCreditBalance, useCreditHistory } from "@/hooks/use-credits";
import { BalanceCard, CreditHistory } from "@/components/credits";

interface CreditsPageProps {
  locale: string;
}

export function CreditsPage({ locale }: CreditsPageProps) {
  const t = useTranslations("dashboard.credits");
  const router = useRouter();
  const [historyPage, setHistoryPage] = useState(0);

  const { balance, isLoading: balanceLoading } = useCreditBalance();
  const {
    transactions,
    hasMore,
    fetchNextPage,
    isLoading: historyLoading,
  } = useCreditHistory();

  // Infinite scroll observer
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !historyLoading) {
          fetchNextPage();
          setHistoryPage((prev) => prev + 1);
        }
      },
      { threshold: 1.0 }
    );

    const current = observerTarget.current;
    if (current) {
      observer.observe(current);
    }

    return () => {
      if (current) {
        observer.unobserve(current);
      }
    };
  }, [hasMore, historyLoading, fetchNextPage]);

  const handleBuyCredits = () => {
    router.push(`/${locale}/buy-credits`);
  };

  // 处理支付成功回调
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const paymentStatus = searchParams.get("payment");
    const returnTo = searchParams.get("returnTo");

    if (paymentStatus === "success") {
      // 移除 URL 参数，避免刷新重复触发
      const newUrl = window.location.pathname;
      window.history.replaceState({}, "", newUrl);

      // 显示成功提示
      // toast.success(t("paymentSuccess"));

      // 如果有 returnTo，延迟跳转回去
      if (returnTo) {
        const decodedPath = decodeURIComponent(returnTo);
        // 使用 toast 显示正在跳转
        // toast.info(t("redirectingBack"));

        // 延迟跳转，让用户看清成功提示
        setTimeout(() => {
          router.push(decodedPath);
        }, 1500);
      }
    }
  }, [router]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
      </div>

      {/* Balance Card */}
      <BalanceCard balance={balance ?? null} onBuyCredits={handleBuyCredits} />

      {/* Credit History */}
      <CreditHistory
        transactions={transactions}
        hasMore={hasMore}
        onLoadMore={() => fetchNextPage()}
      />

      {/* Infinite scroll sentinel */}
      {hasMore && <div ref={observerTarget} className="py-4" />}
    </div>
  );
}
