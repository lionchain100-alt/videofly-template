CREATE TYPE "public"."CreditPackageStatus" AS ENUM('ACTIVE', 'DEPLETED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."CreditTransType" AS ENUM('NEW_USER', 'ORDER_PAY', 'SUBSCRIPTION', 'VIDEO_CONSUME', 'REFUND', 'EXPIRED', 'SYSTEM_ADJUST');--> statement-breakpoint
CREATE TYPE "public"."Status" AS ENUM('PENDING', 'CREATING', 'INITING', 'RUNNING', 'STOPPED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."SubscriptionPlan" AS ENUM('FREE', 'PRO', 'BUSINESS');--> statement-breakpoint
CREATE TYPE "public"."VideoStatus" AS ENUM('PENDING', 'GENERATING', 'UPLOADING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"accessTokenExpiresAt" timestamp,
	"refreshTokenExpiresAt" timestamp,
	"scope" text,
	"idToken" text,
	"password" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_holds" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"video_uuid" text NOT NULL,
	"credits" integer NOT NULL,
	"status" text DEFAULT 'HOLDING' NOT NULL,
	"package_allocation" jsonb NOT NULL,
	"package_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"settled_at" timestamp,
	CONSTRAINT "credit_holds_video_uuid_unique" UNIQUE("video_uuid")
);
--> statement-breakpoint
CREATE TABLE "credit_packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"initial_credits" integer NOT NULL,
	"remaining_credits" integer NOT NULL,
	"frozen_credits" integer DEFAULT 0 NOT NULL,
	"trans_type" "CreditTransType" NOT NULL,
	"order_no" text,
	"status" "CreditPackageStatus" DEFAULT 'ACTIVE' NOT NULL,
	"expired_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"trans_no" text NOT NULL,
	"user_id" text NOT NULL,
	"trans_type" "CreditTransType" NOT NULL,
	"credits" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"package_id" integer,
	"video_uuid" text,
	"order_no" text,
	"hold_id" integer,
	"remark" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_transactions_trans_no_unique" UNIQUE("trans_no")
);
--> statement-breakpoint
CREATE TABLE "creem_subscriptions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"status" text NOT NULL,
	"current_period_end" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creem_subscriptions_subscription_id_unique" UNIQUE("subscription_id")
);
--> statement-breakpoint
CREATE TABLE "Customer" (
	"id" serial PRIMARY KEY NOT NULL,
	"authUserId" text NOT NULL,
	"name" text,
	"plan" "SubscriptionPlan",
	"stripeCustomerId" text,
	"stripeSubscriptionId" text,
	"stripePriceId" text,
	"stripeCurrentPeriodEnd" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "Customer_stripeCustomerId_unique" UNIQUE("stripeCustomerId"),
	CONSTRAINT "Customer_stripeSubscriptionId_unique" UNIQUE("stripeSubscriptionId")
);
--> statement-breakpoint
CREATE TABLE "K8sClusterConfig" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"location" text NOT NULL,
	"authUserId" text NOT NULL,
	"plan" "SubscriptionPlan" DEFAULT 'FREE',
	"network" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"status" "Status" DEFAULT 'PENDING',
	"delete" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "Account" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text
);
--> statement-breakpoint
CREATE TABLE "Session" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sessionToken" text NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "Session_sessionToken_unique" UNIQUE("sessionToken")
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text,
	"emailVerified" timestamp,
	"image" text,
	CONSTRAINT "User_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "VerificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "VerificationToken_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"token" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"isAdmin" boolean DEFAULT false NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid" text NOT NULL,
	"user_id" text NOT NULL,
	"prompt" text NOT NULL,
	"model" text NOT NULL,
	"parameters" jsonb,
	"status" "VideoStatus" DEFAULT 'PENDING' NOT NULL,
	"provider" text,
	"external_task_id" text,
	"error_message" text,
	"start_image_url" text,
	"original_video_url" text,
	"video_url" text,
	"thumbnail_url" text,
	"duration" integer,
	"resolution" text,
	"aspect_ratio" text,
	"file_size" integer,
	"credits_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"generation_time" integer,
	"is_deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "videos_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_id_idx" ON "account" USING btree ("providerId","accountId");--> statement-breakpoint
CREATE INDEX "credit_holds_user_id_idx" ON "credit_holds" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "credit_holds_status_idx" ON "credit_holds" USING btree ("status");--> statement-breakpoint
CREATE INDEX "credit_holds_package_id_idx" ON "credit_holds" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "credit_packages_user_id_status_idx" ON "credit_packages" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "credit_packages_user_id_expired_at_idx" ON "credit_packages" USING btree ("user_id","expired_at");--> statement-breakpoint
CREATE INDEX "credit_transactions_user_id_idx" ON "credit_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "credit_transactions_trans_type_idx" ON "credit_transactions" USING btree ("trans_type");--> statement-breakpoint
CREATE INDEX "credit_transactions_created_at_idx" ON "credit_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "creem_subscriptions_user_id_idx" ON "creem_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "Customer_authUserId_idx" ON "Customer" USING btree ("authUserId");--> statement-breakpoint
CREATE INDEX "K8sClusterConfig_authUserId_idx" ON "K8sClusterConfig" USING btree ("authUserId");--> statement-breakpoint
CREATE UNIQUE INDEX "Account_provider_account_id_idx" ON "Account" USING btree ("provider","providerAccountId");--> statement-breakpoint
CREATE UNIQUE INDEX "VerificationToken_identifier_token_idx" ON "VerificationToken" USING btree ("identifier","token");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "videos_user_id_idx" ON "videos" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "videos_status_idx" ON "videos" USING btree ("status");--> statement-breakpoint
CREATE INDEX "videos_created_at_idx" ON "videos" USING btree ("created_at");