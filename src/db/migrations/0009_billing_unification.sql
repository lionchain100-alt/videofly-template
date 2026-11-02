ALTER TABLE payment_orders DROP CONSTRAINT payment_orders_provider_check;
ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_provider_check CHECK(provider IN ('paypal','waffo','stripe','creem'));
ALTER TABLE payment_orders ADD COLUMN kind text NOT NULL DEFAULT 'PURCHASE' CHECK(kind IN ('PURCHASE','SUBSCRIPTION'));
ALTER TABLE payment_orders ADD COLUMN provider_product_id text;
CREATE TABLE billing_subscriptions (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id), provider text NOT NULL CHECK(provider IN ('stripe','creem')),
 environment text NOT NULL, account_id text NOT NULL, external_id text NOT NULL, customer_id text NOT NULL,
 product_id text NOT NULL, status text NOT NULL, cancel_at_period_end boolean NOT NULL DEFAULT false,
 period_start timestamptz NOT NULL, period_end timestamptz NOT NULL, observed_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,environment,account_id,external_id), CHECK(period_end>period_start)
);
CREATE INDEX billing_subscriptions_user ON billing_subscriptions(user_id);
CREATE TABLE billing_cycles (
 subscription_id text NOT NULL REFERENCES billing_subscriptions(id), period_start timestamptz NOT NULL, period_end timestamptz NOT NULL,
 payment_id text NOT NULL, order_id text NOT NULL UNIQUE REFERENCES payment_orders(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(subscription_id,period_start,period_end), CHECK(period_end>period_start)
);
