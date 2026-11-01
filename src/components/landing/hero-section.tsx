"use client";
import { localePath } from "@/config/site-manifest";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Zap, Play } from "lucide-react";
import { motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  VideoGeneratorInput,
  type SubmitData,
  DEFAULT_CONFIG,
  DEFAULT_DEFAULTS,
} from "@/components/video-generator";
import { BlurFade } from "@/components/magicui/blur-fade";
import { Meteors } from "@/components/magicui/meteors";
import { cn } from "@/components/ui";
import { authClient } from "@/lib/auth/client";
import { calculateModelCredits, getAvailableModels } from "@/config/credits";
import { NEW_USER_GIFT } from "@/config/pricing-user";
import { uploadImage } from "@/lib/video-api";
import { useSigninModal } from "@/hooks/use-signin-modal";
import { videoTaskStorage } from "@/lib/video-task-storage";
import type { ProviderType } from "@/ai";
import { isModelModeSupported, type GenerationMode } from "@/ai/model-mapping";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PENDING_PROMPT_KEY = "videofly_pending_prompt";
const PENDING_IMAGE_KEY = "videofly_pending_image";
const NOTIFICATION_ASKED_KEY = "videofly_notification_asked";
const TOOL_PREFILL_KEY = "videofly_tool_prefill";

function normalizeGeneratorMode(mode?: string): GenerationMode {
  if (mode === "image-to-video" || mode === "i2v") {
    return "image-to-video";
  }
  if (mode === "reference-to-video" || mode === "r2v") {
    return "reference-to-video";
  }
  if (mode === "frames-to-video") {
    return "frames-to-video";
  }
  return "text-to-video";
}

interface HeroSectionProps {
  currentProvider?: ProviderType;
}

/**
 * Hero Section - 视频生成器优先设计
 *
 * 设计模式: Video-First Hero with Glassmorphism
 * - Hero 区域直接集成视频生成组件
 * - Glassmorphism 风格: 背景模糊、透明层、微妙边框
 * - Magic UI 动画组件增强交互体验
 */
export function HeroSection({ currentProvider }: HeroSectionProps) {
  const t = useTranslations("Hero");
  const tNotify = useTranslations("Notifications");
  const locale = useLocale();
  const router = useRouter();
  const signInModal = useSigninModal();
  const { data: session } = authClient.useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showNotifyDialog, setShowNotifyDialog] = useState(false);
  const [pendingSubmitData, setPendingSubmitData] = useState<SubmitData | null>(
    null,
  );

  const generatorConfig = useMemo(() => {
    const availableModels = getAvailableModels({
      provider: currentProvider,
    });
    const availableIds = new Set(availableModels.map((model) => model.id));
    const providerByModel = new Map(
      availableModels.map((model) => [
        model.id,
        currentProvider || model.provider,
      ]),
    );
    const videoModels = DEFAULT_CONFIG.videoModels ?? [];
    const filteredVideoModels = videoModels.filter((model) =>
      availableIds.has(model.id),
    );
    const filteredVideoModes = (DEFAULT_CONFIG.videoModes ?? [])
      .map((mode) => {
        const normalizedMode = normalizeGeneratorMode(mode.id);
        const supportedModels = (mode.supportedModels ?? []).filter(
          (modelId) => {
            if (!availableIds.has(modelId)) return false;
            const provider = providerByModel.get(modelId);
            if (!provider) return false;
            return isModelModeSupported(modelId, provider, normalizedMode);
          },
        );
        return {
          ...mode,
          supportedModels,
        };
      })
      .filter((mode) => mode.supportedModels.length > 0);

    return {
      ...DEFAULT_CONFIG,
      videoModels: filteredVideoModels,
      videoModes: filteredVideoModes,
    };
  }, [currentProvider]);

  const generatorDefaults = useMemo(() => {
    const preferredModel =
      (generatorConfig.videoModels ?? [])[0]?.id ?? DEFAULT_DEFAULTS.videoModel;
    return {
      ...DEFAULT_DEFAULTS,
      videoModel: preferredModel,
    };
  }, [generatorConfig.videoModels]);

  const defaultDuration = useMemo(() => {
    const rawDuration =
      generatorDefaults.duration ?? generatorConfig.durations?.[0];
    if (!rawDuration) return 10;
    const parsed = Number.parseInt(String(rawDuration), 10);
    return Number.isNaN(parsed) ? 10 : parsed;
  }, [generatorDefaults.duration, generatorConfig.durations]);

  const parseDuration = (duration?: string | number) => {
    if (typeof duration === "number") return duration;
    if (!duration) return undefined;
    const parsed = Number.parseInt(duration, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  const calculateCredits = useCallback(
    (params: {
      type: "video" | "image";
      model: string;
      outputNumber: number;
      duration?: string;
      resolution?: string;
    }) => {
      if (params.type !== "video") return 0;
      const parsedDuration = parseDuration(params.duration) ?? defaultDuration;
      const baseCredits = calculateModelCredits(params.model, {
        duration: parsedDuration,
        quality: params.resolution,
      });
      return baseCredits * params.outputNumber;
    },
    [defaultDuration, parseDuration],
  );

  const resolveImageUrls = async (data: SubmitData) => {
    if (data.images && data.images.length > 0) {
      return Promise.all(data.images.map((file) => uploadImage(file)));
    }
    return data.imageUrls;
  };

  const getToolRouteByMode = (mode: string) => {
    const normalized = normalizeGeneratorMode(mode);
    if (normalized === "image-to-video") {
      return "image-to-video";
    }
    if (normalized === "reference-to-video") {
      return "reference-to-video";
    }
    return "text-to-video";
  };

  const processSubmission = async (data: SubmitData) => {
    setIsSubmitting(true);
    try {
      const normalizedMode = normalizeGeneratorMode(data.mode);
      const hasImages =
        (data.images && data.images.length > 0) ||
        (data.imageUrls && data.imageUrls.length > 0);
      const resolvedImageUrls = hasImages
        ? await resolveImageUrls(data)
        : undefined;
      const response = await fetch("/api/v1/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: data.prompt,
          model: data.model,
          mode: normalizedMode,
          duration: parseDuration(data.duration),
          aspectRatio: data.aspectRatio,
          quality: data.quality ?? data.resolution,
          outputNumber: data.outputNumber,
          generateAudio: data.generateAudio,
          imageUrls: resolvedImageUrls,
          imageUrl: resolvedImageUrls?.[0],
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error?.error?.message || error?.message || "Failed to generate video",
        );
      }

      const result = await response.json();
      const toolRoute = getToolRouteByMode(normalizedMode);
      toast.success("Generation started");
      try {
        if (typeof window !== "undefined") {
          sessionStorage.setItem(
            TOOL_PREFILL_KEY,
            JSON.stringify({
              prompt: data.prompt,
              model: data.model,
              mode: normalizedMode,
              duration: parseDuration(data.duration),
              aspectRatio: data.aspectRatio,
              quality: data.quality ?? data.resolution,
              imageUrl: resolvedImageUrls?.[0],
            }),
          );
        }
      } catch (storageError) {
        console.warn("Failed to store tool prefill data:", storageError);
      }
      if (session?.user?.id) {
        videoTaskStorage.addTask({
          userId: session.user.id,
          videoId: result.data.videoUuid,
          taskId: result.data.taskId,
          prompt: data.prompt,
          model: data.model,
          mode: normalizedMode,
          status: "generating",
          createdAt: Date.now(),
          notified: false,
        });
      }
      router.push(
        localePath(locale, `/${toolRoute}?id=${result.data.videoUuid}`),
      );
    } catch (error) {
      console.error("Generation error:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to generate video. Please try again.";
      // Check for common errors and provide helpful messages
      if (message.includes("credits") || message.includes("Credit")) {
        toast.error("Insufficient credits. Please top up and try again.");
      } else if (
        message.includes("database") ||
        message.includes("DATABASE_URL")
      ) {
        toast.error("Service temporarily unavailable. Please try again later.");
      } else {
        toast.error(message || "Failed to generate video. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
      setPendingSubmitData(null);
    }
  };

  const handleAllowNotify = () => {
    setShowNotifyDialog(false);
    Notification.requestPermission().then(() => {
      localStorage.setItem(NOTIFICATION_ASKED_KEY, "1");
      if (pendingSubmitData) {
        processSubmission(pendingSubmitData);
      }
    });
  };

  const handleSkipNotify = () => {
    setShowNotifyDialog(false);
    localStorage.setItem(NOTIFICATION_ASKED_KEY, "1");
    if (pendingSubmitData) {
      processSubmission(pendingSubmitData);
    }
  };

  const handleSubmit = async (data: SubmitData) => {
    let activeUser = session?.user ?? null;
    if (!activeUser) {
      try {
        const fresh = await authClient.getSession();
        activeUser = fresh?.data?.user ?? null;
      } catch (error) {
        console.warn("Failed to refresh session:", error);
      }
    }

    if (!activeUser) {
      try {
        sessionStorage.setItem(PENDING_PROMPT_KEY, data.prompt);
        if (data.images?.[0]) {
          const reader = new FileReader();
          reader.onloadend = () => {
            sessionStorage.setItem(PENDING_IMAGE_KEY, reader.result as string);
          };
          reader.readAsDataURL(data.images[0]);
        }
      } catch (error) {
        console.warn("Failed to store pending input:", error);
      }
      signInModal.onOpen();
      return;
    }

    // Check for notification permission
    if (typeof window !== "undefined" && "Notification" in window) {
      const asked = localStorage.getItem(NOTIFICATION_ASKED_KEY);
      if (!asked && Notification.permission === "default") {
        setPendingSubmitData(data);
        setShowNotifyDialog(true);
        return;
      }
    }

    processSubmission(data);
  };

  return (
    <section
      id="generator"
      className="relative min-h-screen overflow-hidden pb-20"
    >
      {/* 动画流星效果 */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <Meteors
          number={15}
          minDelay={0.5}
          maxDelay={2}
          minDuration={3}
          maxDuration={8}
        />
      </div>

      <div className="container mx-auto px-4 py-12 md:py-16">
        <div className="flex flex-col items-center gap-10">
          {/* 标题与说明区域 */}
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="text-center space-y-6 max-w-3xl mx-auto"
          >
            {/* Badge */}
            <BlurFade delay={0.05} inView>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-primary">
                  {t("badge")}
                </span>
              </div>
            </BlurFade>

            {/* 主标题 */}
            <BlurFade delay={0.1} inView>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
                {t("title")}
              </h1>
            </BlurFade>

            {/* 描述 */}
            <BlurFade delay={0.2} inView>
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                {t("description")}
              </p>
            </BlurFade>

            {/* 特性标签 */}
            <BlurFade
              delay={0.3}
              inView
              className="flex flex-wrap justify-center gap-3"
            >
              {[
                {
                  icon: Zap,
                  label: t("features.fast"),
                  color: "text-yellow-500",
                },
                {
                  icon: Play,
                  label: t("features.easy"),
                  color: "text-primary",
                },
                {
                  icon: Sparkles,
                  label: t("features.ai"),
                  color: "text-primary",
                },
              ].map((feature, idx) => {
                const Icon = feature.icon;
                return (
                  <motion.div
                    key={feature.label}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4 + idx * 0.1 }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/60 dark:bg-white/10 backdrop-blur-sm border border-border/50"
                  >
                    <Icon className={cn("h-4 w-4", feature.color)} />
                    <span className="text-sm font-medium">{feature.label}</span>
                  </motion.div>
                );
              })}
            </BlurFade>
          </motion.div>

          {/* 视频生成器 - 核心组件 */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
            className="w-full max-w-4xl mx-auto relative"
          >
            {/* 装饰性光晕效果 */}
            <div
              className="absolute -inset-4 rounded-3xl blur-3xl -z-10 opacity-30 dark:opacity-10"
              style={{
                backgroundImage:
                  "linear-gradient(to right, oklch(from var(--primary) l c h), oklch(from var(--primary) l c calc(h + 30)))",
              }}
            />

            {/* 视频生成器 - 不需要外层容器，直接使用组件 */}
            {generatorConfig.videoModels.length > 0 ? (
              <VideoGeneratorInput
                config={generatorConfig}
                defaults={generatorDefaults}
                isLoading={isSubmitting}
                disabled={isSubmitting}
                calculateCredits={calculateCredits}
                onSubmit={handleSubmit}
              />
            ) : (
              <div className="rounded-3xl border border-border bg-card/80 p-8 text-center text-sm text-muted-foreground">
                No enabled models are available for the current AI provider
                configuration.
              </div>
            )}

            {NEW_USER_GIFT.enabled && NEW_USER_GIFT.credits > 0 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="text-center text-xs text-muted-foreground mt-4"
              >
                {t("creditsHint", { credits: NEW_USER_GIFT.credits })}
              </motion.p>
            )}
          </motion.div>
        </div>
      </div>

      <AlertDialog open={showNotifyDialog} onOpenChange={setShowNotifyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tNotify("enableNotifications")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tNotify("notificationDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleSkipNotify}>
              {tNotify("maybeLater")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleAllowNotify}>
              {tNotify("allow")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
