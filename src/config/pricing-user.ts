/**
 * ============================================
 * 用户配置文件 - 价格和积分
 * ============================================
 *
 * 📖 使用指南
 * -----------
 * 这个文件包含了所有与价格、积分相关的配置。
 *
 * 🎯 主要配置项：
 * 1. 基础设置 - 新用户赠送、过期规则
 * 2. 订阅产品 - 月付/年付订阅价格和积分
 * 3. 积分包 - 一次性购买积分包
 * 4. 模型计费 - 各 AI 模型的积分消耗规则
 *
 * 📝 修改方法：
 * - 直接修改下面的数值即可（价格用美元，不是美分）
 * - 保存后自动生效，无需重启服务器
 * - 要禁用某个产品，将 enabled 改为 false
 *
 * ⚠️ 注意事项：
 * - id 字段：必须填入 Creem 后台的 Product ID（格式：prod_xxx）
 * - 价格使用美元单位（如 9.9 表示 $9.90）
 * - 积分数量是整数
 * - allowFreeUser: 是否允许免费用户购买（可选，默认 true）
 *
 * 🔄 Creem 配置流程：
 * 1. 在 Creem 后台创建产品（订阅和积分包）
 * 2. 复制每个产品的 Product ID（如 prod_4yNyvLWQ88n8AqJj35uOvK）
 * 3. 将 Product ID 填入下方对应产品的 id 字段
 * 4. .env.local 中无需配置 Price ID（已弃用）
 *
 * ============================================
 */

// ============================================
// 类型定义（内部使用）
// ============================================

/** 视频模型积分配置 */
export interface VideoModelPricing {
  baseCredits: number;
  perSecond: number;
  qualityMultiplier?: number;
  enabled: boolean;
}

/** 订阅产品配置 */
export interface SubscriptionProductConfig {
  billingKey?: string;
  id: string;
  name: string;
  priceUsd: number;
  credits: number;
  period: "month" | "year";
  popular?: boolean;
  enabled: boolean;
  features?: string[];
}

/** 积分包配置 */
export interface CreditPackageConfig {
  id: string;
  name: string;
  priceUsd: number;
  credits: number;
  popular?: boolean;
  enabled: boolean;
  /** 是否允许免费用户购买（可选，默认 true） */
  allowFreeUser?: boolean;
  features?: string[];
}

// ============================================
// 一、基础设置
// ============================================

/**
 * 新用户注册赠送积分
 */
export const NEW_USER_GIFT = {
  /** 是否启用赠送 */
  enabled: true,
  /** 赠送积分数量 */
  credits: 2, // 1 个 Sora 2 视频
  /** 积分有效期（天）*/
  validDays: 30,
};

/**
 * 积分过期设置
 */
export const CREDIT_EXPIRATION = {
  /** 订阅积分有效期（天）- 月付用户 */
  subscriptionDays: 30,
  /** 一次性购买积分有效期（天）- 单独购买积分包 */
  purchaseDays: 365,
  /** 提前多少天提醒积分即将过期 */
  warnBeforeDays: 7,
};

// ============================================
// 二、订阅产品配置
// ============================================

/**
 * 订阅产品列表
 *
 * 每个产品包含：
 * - id: Creem Product ID（从 Creem 后台复制，如 prod_xxx）
 * - name: 显示名称
 * - priceUsd: 价格（美元）
 * - credits: 每周期赠送积分
 * - period: 付费周期 ("month" 或 "year")
 * - popular: 是否标记为推荐（最多选1-2个）
 * - enabled: 是否启用该产品
 *
 * ⚠️ 重要：id 字段必须是 Creem 后台的 Product ID（格式：prod_xxx）
 * 在 Creem 后台创建产品后，复制 Product ID 到下方对应的 id 字段
 */
export const SUBSCRIPTION_PRODUCTS = [
  // ===== 月付订阅 =====
  {
    id: "prod_jsRIeZmqn3L9NN2fiFIn6", // 从 Creem 后台复制 Basic Monthly Product ID
    billingKey: "BASIC_MONTHLY",
    name: "Basic Plan",
    priceUsd: 9.9,
    credits: 280, // ~28 Veo 3.1 视频 (60% 毛利率)
    period: "month" as const,
    popular: false,
    enabled: true,
    features: ["hd_videos", "fast_generation"],
  },
  {
    id: "prod_3tlZPSRNHZSaNq21zX2Z16", // 从 Creem 后台复制 Pro Monthly Product ID
    billingKey: "PRO_MONTHLY",
    name: "Pro Plan",
    priceUsd: 29.9,
    credits: 960, // ~96 Veo 3.1 视频 (55% 毛利率，比 Basic 便宜 12%)
    period: "month" as const,
    popular: true, // 推荐
    enabled: true,
    features: [
      "hd_videos",
      "fast_generation",
      "no_watermark",
      "commercial_use",
    ],
  },
  {
    id: "prod_3tlZPSRNHZSaNq22zX2Z18", // 从 Creem 后台复制 Ultimate Monthly Product ID
    billingKey: "ULTIMATE_MONTHLY",
    name: "Ultimate Plan",
    priceUsd: 79.9,
    credits: 2850, // ~285 Veo 3.1 视频 (50% 毛利率，比 Basic 便宜 21%)
    period: "month" as const,
    popular: false,
    enabled: true,
    features: [
      "hd_videos",
      "fast_generation",
      "no_watermark",
      "commercial_use",
      "priority_support",
      "api_access",
    ],
  },

  // ===== 年付订阅（月付 × 10，买 10 送 2） =====
  {
    id: "prod_3tlZPSRNHZSaNq22zX2Z10", // 从 Creem 后台复制 Basic Yearly Product ID
    billingKey: "BASIC_YEARLY",
    name: "Basic Plan (Yearly)",
    priceUsd: 99, // 月付 × 10 (省 2 个月)
    credits: 3360, // 280 × 12
    period: "year" as const,
    popular: false,
    enabled: true,
    features: ["hd_videos", "fast_generation"],
  },
  {
    id: "prod_3tlZPSRNHZSaNq22zX2Z55", // 从 Creem 后台复制 Pro Yearly Product ID
    billingKey: "PRO_YEARLY",
    name: "Pro Plan (Yearly)",
    priceUsd: 299, // 月付 × 10 (省 2 个月)
    credits: 11520, // 960 × 12
    period: "year" as const,
    popular: true,
    enabled: true,
    features: [
      "hd_videos",
      "fast_generation",
      "no_watermark",
      "commercial_use",
    ],
  },
  {
    id: "prod_3tlZPSRNHZSaNq22zX2Z21", // 从 Creem 后台复制 Ultimate Yearly Product ID
    billingKey: "ULTIMATE_YEARLY",
    name: "Ultimate Plan (Yearly)",
    priceUsd: 799, // 月付 × 10 (省 2 个月)
    credits: 34200, // 2850 × 12
    period: "year" as const,
    popular: false,
    enabled: true,
    features: [
      "hd_videos",
      "fast_generation",
      "no_watermark",
      "commercial_use",
      "priority_support",
      "api_access",
    ],
  },
];

// ============================================
// 三、一次性购买积分包
// ============================================

/**
 * 积分包产品列表
 *
 * 用户可以单独购买积分包（不订阅）
 *
 * allowFreeUser 说明：
 * - true:  所有用户都可以购买此积分包
 * - false: 只有订阅用户才能购买此积分包
 * - 不填: 默认为 true（所有用户可购买）
 *
 * ⚠️ 重要：id 字段必须是 Creem 后台的 Product ID（格式：prod_xxx）
 */
export const CREDIT_PACKAGES: CreditPackageConfig[] = [
  {
    id: "prod_3tlZPSRNHZSaNq21zX2ZPO", // 从 Creem 后台复制 Starter Pack Product ID
    name: "Starter Pack",
    priceUsd: 14.9,
    credits: 280, // 和 Basic 月付积分相同
    popular: true, // 推荐
    enabled: true,
    allowFreeUser: true, // 所有用户可购买
    features: ["hd_videos", "fast_generation"],
  },
  {
    id: "prod_3tlZPSRNHZSaNq22zX2Z12", // 从 Creem 后台复制 Standard Pack Product ID
    name: "Standard Pack",
    priceUsd: 39.9, // 比月付 Pro 贵 33%
    credits: 960, // 和 Pro 月付积分相同
    popular: false,
    enabled: true,
    allowFreeUser: false, // 仅订阅用户
    features: ["hd_videos", "fast_generation", "no_watermark"],
  },
  {
    id: "prod_3tlZPSRNHZSaNq22zX2Z13", // 从 Creem 后台复制 Pro Pack Product ID
    name: "Pro Pack",
    priceUsd: 99.9, // 比月付 Ultimate 贵 25%
    credits: 2850, // 和 Ultimate 月付积分相同
    popular: false,
    enabled: true,
    allowFreeUser: false, // 仅订阅用户
    features: [
      "hd_videos",
      "fast_generation",
      "no_watermark",
      "commercial_use",
    ],
  },
];

// ============================================
// 四、AI 模型积分计费
// ============================================

/**
 * 视频生成模型积分配置
 *
 * 💡 定价说明（基于 Evolink 1:1 成本，向上取整）:
 *
 * 1. **Veo 3.1 Fast Lite**: 固定 10 积分（基准价格）
 * 2. **Sora 2 Lite**: 10s=2积分, 15s=3积分 (无水印)
 * 3. **Wan 2.6**: 720p: 5s=25积分, 10s=50积分, 15s=75积分
 *              1080p × 1.67 倍
 * 4. **Seedance 1.5 Pro**: 按秒计费, 默认有音频
 *                          480p: 1.636 Credits/秒 → 2 积分/秒
 *                          720p: 3.557 Credits/秒 → 4 积分/秒
 *                          1080p: 7.932 Credits/秒 → 8 积分/秒
 *
 * 计费规则说明：
 * - baseCredits: 基础积分（最短时长、最低画质）
 * - perSecond: 每秒积分（用于按秒计费的模型）
 * - qualityMultiplier: 画质乘数（1080p vs 720p）
 */
export const VIDEO_MODEL_PRICING: Record<string, VideoModelPricing> = {
  /** Seedance 1.5 Pro - 按秒计费（默认有音频） */
  "seedance-1.5-pro": {
    baseCredits: 0,
    perSecond: 4, // 720p 有音频: 3.557 Credits/秒 → 4 积分/秒
    qualityMultiplier: 2, // 1080p = 720p × 2
    enabled: true,
  },

  /** Seedance 1.0 Pro Fast - 快速生成（APImart） */
  "seedance-1.0-pro-fast": {
    baseCredits: 0,
    perSecond: 3, // 按秒计费
    qualityMultiplier: 2,
    enabled: true,
  },

  /** Seedance 1.0 Pro Quality - 高质量生成（APImart） */
  "seedance-1.0-pro-quality": {
    baseCredits: 0,
    perSecond: 5, // 高质量，每秒积分更高
    qualityMultiplier: 2,
    enabled: true,
  },

  /** Veo 3.1 Fast Lite - Google (暂时隐藏) */
  "veo-3.1": {
    baseCredits: 10,
    perSecond: 0,
    enabled: false,
  },

  /** Sora 2 Lite - OpenAI (暂时隐藏) */
  "sora-2": {
    baseCredits: 2,
    perSecond: 0,
    enabled: false,
  },

  /** Wan 2.6 (暂时隐藏) */
  "wan2.6": {
    baseCredits: 25,
    perSecond: 5,
    qualityMultiplier: 1.67,
    enabled: false,
  },
};

// ============================================
// 五、支付配置（环境变量）
// ============================================

/**
 * 支付提供商配置
 *
 * 这些配置通常在 .env.local 文件中设置
 * 这里只是说明，不需要修改
 */
export const PAYMENT_CONFIG = {
  /** 使用 Creem 支付 */
  provider: "creem",
  /** Creem Webhook URL（用于接收支付状态通知）*/
  webhookUrl: process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/creem/webhook`
    : "",
};
