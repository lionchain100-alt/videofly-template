ALTER TYPE "CreditTransType" ADD VALUE IF NOT EXISTS 'REFUND_HOLD';
ALTER TYPE "CreditTransType" ADD VALUE IF NOT EXISTS 'REFUND_RECLAIM';
ALTER TYPE "CreditTransType" ADD VALUE IF NOT EXISTS 'REFUND_RELEASE';
ALTER TABLE credit_packages ADD COLUMN refund_reserved_credits integer NOT NULL DEFAULT 0 CHECK (refund_reserved_credits >= 0);
ALTER TABLE credit_packages ADD COLUMN refund_reclaimed_credits integer NOT NULL DEFAULT 0 CHECK (refund_reclaimed_credits >= 0);
ALTER TABLE payment_orders ADD COLUMN refunded_amount integer NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0 AND refunded_amount <= amount);
ALTER TABLE payment_orders ADD COLUMN refund_credit_target integer NOT NULL DEFAULT 0 CHECK (refund_credit_target >= 0 AND refund_credit_target <= credits);
ALTER TABLE payment_orders ADD COLUMN refund_credit_shortfall integer NOT NULL DEFAULT 0 CHECK (refund_credit_shortfall >= 0);
ALTER TABLE payment_orders ADD COLUMN refund_credits_waived integer NOT NULL DEFAULT 0 CHECK (refund_credits_waived >= 0);
CREATE TABLE payment_refunds (
 id text PRIMARY KEY, request_id text NOT NULL UNIQUE, request_hash text NOT NULL,
 order_id text NOT NULL REFERENCES payment_orders(id), actor_user_id text REFERENCES "user"(id),
 provider text NOT NULL CHECK (provider IN ('paypal','waffo')), environment text NOT NULL, account_id text NOT NULL,
 payment_id text NOT NULL, amount integer NOT NULL CHECK (amount > 0), currency text NOT NULL CHECK (currency='USD'),
 reason text NOT NULL, status text NOT NULL CHECK (status IN ('BLOCKED','QUEUED','SUBMITTING','PENDING','SUCCEEDED','FAILED','REVIEW')),
 reserved_credits integer NOT NULL DEFAULT 0 CHECK (reserved_credits >= 0),
 reclaimed_credits integer NOT NULL DEFAULT 0 CHECK (reclaimed_credits >= 0),
 external_id text, ticket_id text, last_error text, lease_token text, lease_until timestamptz,
 next_check_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 UNIQUE(provider,environment,account_id,external_id)
);
CREATE INDEX payment_refunds_order_idx ON payment_refunds(order_id,created_at DESC);
CREATE INDEX payment_refunds_due_idx ON payment_refunds(next_check_at) WHERE status IN ('QUEUED','SUBMITTING','PENDING');
CREATE TABLE payment_refund_reviews (
 request_id text PRIMARY KEY, request_hash text NOT NULL,
 order_id text NOT NULL REFERENCES payment_orders(id), actor_user_id text NOT NULL REFERENCES "user"(id),
 reason text NOT NULL, waived_credits integer NOT NULL CHECK(waived_credits > 0),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE credit_transactions ADD COLUMN refund_id text REFERENCES payment_refunds(id);
CREATE UNIQUE INDEX credit_transactions_refund_phase_idx ON credit_transactions(refund_id,trans_type) WHERE refund_id IS NOT NULL;
