import { sql } from "drizzle-orm";
import {
  boolean,
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  pgView,
  serial,
  text,
  timestamp,
  uniqueIndex,
  unique,
  check,
} from "drizzle-orm/pg-core";

export const subscriptionPlanEnum = pgEnum("SubscriptionPlan", [
  "FREE",
  "PRO",
  "BUSINESS",
]);

export const statusEnum = pgEnum("Status", [
  "PENDING",
  "CREATING",
  "INITING",
  "RUNNING",
  "STOPPED",
  "DELETED",
]);

export const creditTransTypeEnum = pgEnum("CreditTransType", [
  "NEW_USER",
  "ORDER_PAY",
  "SUBSCRIPTION",
  "VIDEO_CONSUME",
  "REFUND",
  "EXPIRED",
  "SYSTEM_ADJUST",
  "TASK_HOLD",
  "TASK_SETTLE",
  "TASK_RELEASE",
  "REFUND_HOLD",
  "REFUND_RECLAIM",
  "REFUND_RELEASE",
]);

export const creditPackageStatusEnum = pgEnum("CreditPackageStatus", [
  "ACTIVE",
  "DEPLETED",
  "EXPIRED",
]);

export const videoStatusEnum = pgEnum("VideoStatus", [
  "PENDING",
  "GENERATING",
  "UPLOADING",
  "COMPLETED",
  "FAILED",
]);

export const customers = pgTable(
  "Customer",
  {
    id: serial("id").primaryKey(),
    authUserId: text("authUserId").notNull(),
    name: text("name"),
    plan: subscriptionPlanEnum("plan"),
    stripeCustomerId: text("stripeCustomerId").unique(),
    stripeSubscriptionId: text("stripeSubscriptionId").unique(),
    stripePriceId: text("stripePriceId"),
    stripeCurrentPeriodEnd: timestamp("stripeCurrentPeriodEnd"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (table) => ({
    authUserIdIdx: index("Customer_authUserId_idx").on(table.authUserId),
  }),
);

export const users = pgTable("user", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  isAdmin: boolean("isAdmin").default(false).notNull(),
  disabled: boolean("disabled").default(false).notNull(),
  disabledReason: text("disabled_reason"),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
});

export const creemSubscriptions = pgTable(
  "creem_subscriptions",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id").notNull(),
    productId: text("product_id").notNull(),
    subscriptionId: text("subscription_id").notNull().unique(),
    status: text("status").notNull(),
    currentPeriodEnd: timestamp("current_period_end"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("creem_subscriptions_user_id_idx").on(table.userId),
  }),
);

export const sessions = pgTable(
  "session",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("userId").notNull(),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expiresAt").notNull(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("session_user_id_idx").on(table.userId),
  }),
);

export const accounts = pgTable(
  "account",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("userId").notNull(),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
    scope: text("scope"),
    idToken: text("idToken"),
    password: text("password"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("account_user_id_idx").on(table.userId),
    providerAccountIdIdx: uniqueIndex("account_provider_account_id_idx").on(
      table.providerId,
      table.accountId,
    ),
  }),
);

export const verifications = pgTable("verification", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const legacyAccounts = pgTable(
  "Account",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("userId").notNull(),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refreshToken: text("refresh_token"),
    accessToken: text("access_token"),
    expiresAt: integer("expires_at"),
    tokenType: text("token_type"),
    scope: text("scope"),
    idToken: text("id_token"),
    sessionState: text("session_state"),
  },
  (table) => ({
    providerAccountIdIdx: uniqueIndex("Account_provider_account_id_idx").on(
      table.provider,
      table.providerAccountId,
    ),
  }),
);

export const legacySessions = pgTable("Session", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionToken: text("sessionToken").notNull().unique(),
  userId: text("userId").notNull(),
  expires: timestamp("expires").notNull(),
});

export const legacyUsers = pgTable("User", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified"),
  image: text("image"),
});

export const legacyVerificationTokens = pgTable(
  "VerificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull().unique(),
    expires: timestamp("expires").notNull(),
  },
  (table) => ({
    identifierTokenIdx: uniqueIndex(
      "VerificationToken_identifier_token_idx",
    ).on(table.identifier, table.token),
  }),
);

export const k8sClusterConfigs = pgTable(
  "K8sClusterConfig",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    location: text("location").notNull(),
    authUserId: text("authUserId").notNull(),
    plan: subscriptionPlanEnum("plan").default("FREE"),
    network: text("network"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
    status: statusEnum("status").default("PENDING"),
    delete: boolean("delete").default(false),
  },
  (table) => ({
    authUserIdIdx: index("K8sClusterConfig_authUserId_idx").on(
      table.authUserId,
    ),
  }),
);

export const creditPackages = pgTable(
  "credit_packages",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    initialCredits: integer("initial_credits").notNull(),
    remainingCredits: integer("remaining_credits").notNull(),
    frozenCredits: integer("frozen_credits").default(0).notNull(),
    refundReservedCredits: integer("refund_reserved_credits")
      .default(0)
      .notNull(),
    refundReclaimedCredits: integer("refund_reclaimed_credits")
      .default(0)
      .notNull(),
    transType: creditTransTypeEnum("trans_type").notNull(),
    orderNo: text("order_no"),
    status: creditPackageStatusEnum("status").default("ACTIVE").notNull(),
    expiredAt: timestamp("expired_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userStatusIdx: index("credit_packages_user_id_status_idx").on(
      table.userId,
      table.status,
    ),
    userExpiredIdx: index("credit_packages_user_id_expired_at_idx").on(
      table.userId,
      table.expiredAt,
    ),
  }),
);

export const creditHolds = pgTable(
  "credit_holds",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    videoUuid: text("video_uuid").unique(),
    taskId: text("task_id")
      .unique("credit_holds_task_id_key")
      .references(() => tasks.id),
    credits: integer("credits").notNull(),
    status: text("status").default("HOLDING").notNull(),
    packageAllocation: jsonb("package_allocation").notNull(),
    packageId: integer("package_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    settledAt: timestamp("settled_at"),
  },
  (table) => ({
    userIdx: index("credit_holds_user_id_idx").on(table.userId),
    statusIdx: index("credit_holds_status_idx").on(table.status),
    packageIdx: index("credit_holds_package_id_idx").on(table.packageId),
    oneReference: check(
      "credit_holds_one_reference",
      sql`num_nonnulls(${table.videoUuid},${table.taskId})=1`,
    ),
  }),
);

export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id: serial("id").primaryKey(),
    transNo: text("trans_no").notNull().unique(),
    userId: text("user_id").notNull(),
    transType: creditTransTypeEnum("trans_type").notNull(),
    credits: integer("credits").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    packageId: integer("package_id"),
    videoUuid: text("video_uuid"),
    orderNo: text("order_no"),
    holdId: integer("hold_id"),
    remark: text("remark"),
    actorUserId: text("actor_user_id").references(() => users.id),
    taskId: text("task_id").references(() => tasks.id),
    refundId: text("refund_id").references(() => paymentRefunds.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("credit_transactions_user_id_idx").on(table.userId),
    taskPhaseUnique: uniqueIndex("credit_transactions_task_phase_unique")
      .on(table.taskId, table.transType)
      .where(sql`${table.taskId} is not null`),
    refundPhaseUnique: uniqueIndex("credit_transactions_refund_phase_idx")
      .on(table.refundId, table.transType)
      .where(sql`${table.refundId} is not null`),
    transTypeIdx: index("credit_transactions_trans_type_idx").on(
      table.transType,
    ),
    createdAtIdx: index("credit_transactions_created_at_idx").on(
      table.createdAt,
    ),
  }),
);

export const adminOperations = pgTable(
  "admin_operations",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    requestId: text("request_id").notNull().unique(),
    requestHash: text("request_hash").notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id),
    targetUserId: text("target_user_id")
      .notNull()
      .references(() => users.id),
    action: text("action").notNull(),
    reason: text("reason").notNull(),
    credits: integer("credits"),
    packageId: integer("package_id").references(() => creditPackages.id),
    transactionId: integer("transaction_id").references(
      () => creditTransactions.id,
    ),
    balanceAfter: integer("balance_after"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    targetTimeIdx: index("admin_operations_target_time_idx").on(
      table.targetUserId,
      table.createdAt,
    ),
    actorTimeIdx: index("admin_operations_actor_time_idx").on(
      table.actorUserId,
      table.createdAt,
    ),
    transactionUniqueIdx: uniqueIndex(
      "admin_operations_transaction_unique_idx",
    ).on(table.transactionId),
    actionCheck: check(
      "admin_operations_action_check",
      sql`${table.action} in ('CREDIT_GRANT', 'USER_DISABLE', 'USER_ENABLE')`,
    ),
    creditsCheck: check(
      "admin_operations_credits_check",
      sql`${table.credits} is null or ${table.credits} > 0`,
    ),
  }),
);

export const paymentOrders = pgTable(
  "payment_orders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    requestId: text("request_id").notNull(),
    provider: text("provider").notNull(),
    kind: text("kind").notNull().default("PURCHASE"),
    providerProductId: text("provider_product_id"),
    environment: text("environment").notNull(),
    accountId: text("account_id").notNull(),
    productId: text("product_id").notNull(),
    productName: text("product_name").notNull(),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    refundedAmount: integer("refunded_amount").notNull().default(0),
    refundCreditTarget: integer("refund_credit_target").notNull().default(0),
    refundCreditShortfall: integer("refund_credit_shortfall")
      .notNull()
      .default(0),
    refundCreditsWaived: integer("refund_credits_waived").notNull().default(0),
    credits: integer("credits").notNull(),
    expiryDays: integer("expiry_days").notNull(),
    status: text("status").notNull().default("CREATING"),
    externalId: text("external_id"),
    checkoutUrl: text("checkout_url"),
    leaseToken: text("lease_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    nextCheckAt: timestamp("next_check_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => ({
    requestUnique: unique().on(t.userId, t.requestId),
    externalUnique: unique().on(
      t.provider,
      t.environment,
      t.accountId,
      t.externalId,
    ),
  }),
);
export const paymentFulfillments = pgTable(
  "payment_fulfillments",
  {
    orderId: text("order_id")
      .primaryKey()
      .references(() => paymentOrders.id),
    provider: text("provider").notNull(),
    environment: text("environment").notNull(),
    accountId: text("account_id").notNull(),
    paymentId: text("payment_id").notNull(),
    packageId: integer("package_id")
      .notNull()
      .unique()
      .references(() => creditPackages.id),
    transactionId: integer("transaction_id")
      .notNull()
      .unique()
      .references(() => creditTransactions.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    paymentUnique: unique().on(
      t.provider,
      t.environment,
      t.accountId,
      t.paymentId,
    ),
  }),
);

export const billingSubscriptions = pgTable(
  "billing_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    provider: text("provider").notNull(),
    environment: text("environment").notNull(),
    accountId: text("account_id").notNull(),
    externalId: text("external_id").notNull(),
    customerId: text("customer_id").notNull(),
    productId: text("product_id").notNull(),
    status: text("status").notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    scope: unique().on(t.provider, t.environment, t.accountId, t.externalId),
  }),
);
export const billingCycles = pgTable(
  "billing_cycles",
  {
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => billingSubscriptions.id),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    paymentId: text("payment_id").notNull(),
    orderId: text("order_id")
      .notNull()
      .unique()
      .references(() => paymentOrders.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({ cycle: unique().on(t.subscriptionId, t.periodStart, t.periodEnd) }),
);
export const paymentEvents = pgTable(
  "payment_events",
  {
    provider: text("provider").notNull(),
    environment: text("environment").notNull(),
    accountId: text("account_id").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    orderId: text("order_id").references(() => paymentOrders.id),
    status: text("status").notNull(),
    normalizedEvent: jsonb("normalized_event"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastError: text("last_error"),
    reviewStatus: text("review_status").notNull().default("OPEN"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => ({
    eventUnique: unique().on(t.provider, t.environment, t.accountId, t.eventId),
  }),
);

export const paymentOperations = pgTable("payment_operations", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().unique(),
  requestHash: text("request_hash").notNull(),
  actorUserId: text("actor_user_id")
    .notNull()
    .references(() => users.id),
  action: text("action").notNull(),
  reason: text("reason").notNull(),
  target: jsonb("target").notNull(),
  orderId: text("order_id").references(() => paymentOrders.id),
  status: text("status").notNull(),
  resultCode: text("result_code"),
  message: text("message"),
  attempts: integer("attempts").notNull().default(0),
  leaseToken: text("lease_token"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});
export const paymentRefunds = pgTable(
  "payment_refunds",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull().unique(),
    requestHash: text("request_hash").notNull(),
    orderId: text("order_id")
      .notNull()
      .references(() => paymentOrders.id),
    actorUserId: text("actor_user_id").references(() => users.id),
    provider: text("provider").notNull(),
    environment: text("environment").notNull(),
    accountId: text("account_id").notNull(),
    paymentId: text("payment_id").notNull(),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull(),
    reservedCredits: integer("reserved_credits").notNull().default(0),
    reclaimedCredits: integer("reclaimed_credits").notNull().default(0),
    externalId: text("external_id"),
    ticketId: text("ticket_id"),
    lastError: text("last_error"),
    leaseToken: text("lease_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    nextCheckAt: timestamp("next_check_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => ({
    externalUnique: unique().on(
      t.provider,
      t.environment,
      t.accountId,
      t.externalId,
    ),
  }),
);
export const paymentRefundReviews = pgTable("payment_refund_reviews", {
  requestId: text("request_id").primaryKey(),
  requestHash: text("request_hash").notNull(),
  orderId: text("order_id")
    .notNull()
    .references(() => paymentOrders.id),
  actorUserId: text("actor_user_id")
    .notNull()
    .references(() => users.id),
  reason: text("reason").notNull(),
  waivedCredits: integer("waived_credits").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const projectMigrations = pgTable("project_migrations", {
  name: text("name").primaryKey(),
  checksum: text("checksum").notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    requestId: text("request_id").notNull(),
    inputHash: text("input_hash").notNull(),
    toolId: text("tool_id").notNull(),
    status: text("status").notNull().default("QUEUED"),
    input: jsonb("input").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    executionConfig: jsonb("execution_config").notNull(),
    credits: integer("credits").notNull(),
    result: text("result"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    providerRequestId: text("provider_request_id"),
    usage: jsonb("usage"),
    leaseToken: text("lease_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    queueDeadline: timestamp("queue_deadline", {
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => ({
    userRequestUnique: unique("tasks_user_id_request_id_key").on(
      table.userId,
      table.requestId,
    ),
    statusCheck: check(
      "tasks_status_check",
      sql`${table.status} in ('QUEUED','RUNNING','SUCCEEDED','FAILED')`,
    ),
    creditsCheck: check("tasks_credits_check", sql`${table.credits} > 0`),
    userTimeIdx: index("tasks_user_time_idx").on(table.userId, table.createdAt),
    queueIdx: index("tasks_queue_idx")
      .on(table.status, table.createdAt)
      .where(sql`${table.status} in ('QUEUED','RUNNING')`),
  }),
);
export const taskAttempts = pgTable("task_attempts", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .unique("task_attempts_task_id_key")
    .references(() => tasks.id),
  status: text("status").notNull(),
  errorCode: text("error_code"),
  providerRequestId: text("provider_request_id"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const videoJobs = pgTable(
  "video_jobs",
  {
    taskId: text("task_id")
      .primaryKey()
      .references(() => tasks.id),
    stage: text("stage").notNull().default("QUEUED"),
    provider: text("provider").notNull(),
    providerTaskId: text("provider_task_id"),
    sourceUrl: text("source_url"),
    nextRunAt: timestamp("next_run_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseToken: text("lease_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    pollAttempts: integer("poll_attempts").notNull().default(0),
    storageAttempts: integer("storage_attempts").notNull().default(0),
    lastError: text("last_error"),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    providerUnique: unique("video_jobs_provider_provider_task_id_key").on(
      t.provider,
      t.providerTaskId,
    ),
    stageCheck: check(
      "video_jobs_stage_check",
      sql`${t.stage} in ('QUEUED','SUBMITTING','POLLING','STORING','RECONCILING','DONE')`,
    ),
    dueIndex: index("video_jobs_due_idx")
      .on(t.nextRunAt)
      .where(sql`${t.stage} not in ('DONE','RECONCILING')`),
  }),
);
export const taskAssets = pgTable(
  "task_assets",
  {
    taskId: text("task_id")
      .primaryKey()
      .references(() => tasks.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    storageKey: text("storage_key")
      .notNull()
      .unique("task_assets_storage_key_key"),
    mime: text("mime").notNull(),
    byteLength: integer("byte_length").notNull(),
    sha256: text("sha256").notNull(),
    storageBackend: text("storage_backend").notNull().default("local"),
    storageScope: text("storage_scope"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    sizeCheck: check("task_assets_byte_length_check", sql`${t.byteLength}>0`),
  }),
);
export const videoReviews = pgTable(
  "video_reviews",
  {
    requestId: text("request_id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    action: text("action").notNull(),
    reason: text("reason").notNull(),
    providerTaskId: text("provider_task_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    actionCheck: check(
      "video_reviews_action_check",
      sql`${t.action} in ('LINK_TASK','CONFIRM_FAILURE','RETRY_STORAGE')`,
    ),
  }),
);

export const workerHeartbeats = pgTable(
  "worker_heartbeats",
  {
    siteId: text("site_id").notNull(),
    kind: text("kind").notNull(),
    instanceId: text("instance_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    progressAt: timestamp("progress_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    status: text("status").notNull(),
    lastError: text("last_error"),
  },
  (t) => ({ identity: unique().on(t.siteId, t.kind, t.instanceId) }),
);
export const privateUploads = pgTable("private_uploads", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  storageBackend: text("storage_backend").notNull(),
  storageScope: text("storage_scope"),
  storageKey: text("storage_key").notNull().unique(),
  mime: text("mime").notNull(),
  byteLength: integer("byte_length").notNull(),
  sha256: text("sha256").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const adminTaskRows = pgView("admin_task_rows", {
  uuid: text("uuid").notNull(),
  userId: text("user_id").notNull(),
  model: text("model").notNull(),
  provider: text("provider"),
  status: text("status").notNull(),
  prompt: text("prompt").notNull(),
  creditsUsed: integer("credits_used").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  errorMessage: text("error_message"),
  isDeleted: boolean("is_deleted").notNull(),
  externalTaskId: text("external_task_id"),
  kind: text("kind").notNull(),
}).existing();

export const videos = pgTable(
  "videos",
  {
    id: serial("id").primaryKey(),
    uuid: text("uuid").notNull().unique(),
    userId: text("user_id").notNull(),
    prompt: text("prompt").notNull(),
    model: text("model").notNull(),
    parameters: jsonb("parameters"),
    status: videoStatusEnum("status").default("PENDING").notNull(),
    provider: text("provider"),
    externalTaskId: text("external_task_id"),
    errorMessage: text("error_message"),
    startImageUrl: text("start_image_url"),
    originalVideoUrl: text("original_video_url"),
    videoUrl: text("video_url"),
    thumbnailUrl: text("thumbnail_url"),
    duration: integer("duration"),
    resolution: text("resolution"),
    aspectRatio: text("aspect_ratio"),
    fileSize: integer("file_size"),
    creditsUsed: integer("credits_used").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    generationTime: integer("generation_time"),
    isDeleted: boolean("is_deleted").default(false).notNull(),
  },
  (table) => ({
    userIdx: index("videos_user_id_idx").on(table.userId),
    statusIdx: index("videos_status_idx").on(table.status),
    createdAtIdx: index("videos_created_at_idx").on(table.createdAt),
  }),
);

export type Customer = typeof customers.$inferSelect;
export type BetterAuthUser = typeof users.$inferSelect;
export type CreditPackage = typeof creditPackages.$inferSelect;
export type CreditHold = typeof creditHolds.$inferSelect;
export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type Video = typeof videos.$inferSelect;

export const SubscriptionPlan = {
  FREE: "FREE",
  PRO: "PRO",
  BUSINESS: "BUSINESS",
} as const;
export type SubscriptionPlan =
  (typeof SubscriptionPlan)[keyof typeof SubscriptionPlan];

export const CreditTransType = {
  NEW_USER: "NEW_USER",
  ORDER_PAY: "ORDER_PAY",
  SUBSCRIPTION: "SUBSCRIPTION",
  VIDEO_CONSUME: "VIDEO_CONSUME",
  REFUND: "REFUND",
  EXPIRED: "EXPIRED",
  SYSTEM_ADJUST: "SYSTEM_ADJUST",
  TASK_HOLD: "TASK_HOLD",
  TASK_SETTLE: "TASK_SETTLE",
  TASK_RELEASE: "TASK_RELEASE",
  REFUND_HOLD: "REFUND_HOLD",
  REFUND_RECLAIM: "REFUND_RECLAIM",
  REFUND_RELEASE: "REFUND_RELEASE",
} as const;
export type CreditTransType =
  (typeof CreditTransType)[keyof typeof CreditTransType];

export const CreditPackageStatus = {
  ACTIVE: "ACTIVE",
  DEPLETED: "DEPLETED",
  EXPIRED: "EXPIRED",
} as const;
export type CreditPackageStatus =
  (typeof CreditPackageStatus)[keyof typeof CreditPackageStatus];

export const VideoStatus = {
  PENDING: "PENDING",
  GENERATING: "GENERATING",
  UPLOADING: "UPLOADING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;
export type VideoStatus = (typeof VideoStatus)[keyof typeof VideoStatus];
// AUD-007 raw-SQL services use these same tables; schema ownership remains explicit.
export const aiPolicyVersions = pgTable(
  "ai_policy_versions",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull(),
    revision: integer("revision").notNull(),
    config: jsonb("config").notNull(),
    actorId: text("actor_id").references(() => users.id),
    reason: text("reason").notNull(),
    requestId: text("request_id").notNull().unique(),
    requestHash: text("request_hash").notNull(),
    origin: text("origin").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({ revisionUnique: unique().on(t.siteId, t.revision) }),
);
export const aiPolicyCurrent = pgTable("ai_policy_current", {
  siteId: text("site_id").primaryKey(),
  versionId: text("version_id")
    .notNull()
    .references(() => aiPolicyVersions.id),
});
export const aiCostUsage = pgTable("ai_cost_usage", {
  taskId: text("task_id")
    .primaryKey()
    .references(() => tasks.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  siteId: text("site_id").notNull(),
  policyVersion: text("policy_version").notNull(),
  profileSnapshot: jsonb("profile_snapshot").notNull(),
  estimateMicros: bigint("estimate_micros", { mode: "number" }).notNull(),
  chargedMicros: bigint("charged_micros", { mode: "number" }).notNull(),
  usageMicros: bigint("usage_micros", { mode: "number" }),
  confirmedMicros: bigint("confirmed_micros", { mode: "number" }),
  status: text("status").notNull(),
  anomaly: text("anomaly"),
  dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const aiCostReviews = pgTable("ai_cost_reviews", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().unique(),
  requestHash: text("request_hash").notNull(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  actorId: text("actor_id")
    .notNull()
    .references(() => users.id),
  amountMicros: bigint("amount_micros", { mode: "number" }).notNull(),
  evidenceReference: text("evidence_reference").notNull(),
  reason: text("reason").notNull(),
  previousCost: jsonb("previous_cost").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const aiGovernanceIncidents = pgTable(
  "ai_governance_incidents",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requestId: text("request_id").notNull(),
    code: text("code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    incidentUnique: unique().on(t.siteId, t.userId, t.requestId, t.code),
  }),
);
