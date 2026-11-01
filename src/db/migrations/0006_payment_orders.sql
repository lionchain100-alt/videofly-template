CREATE TABLE payment_orders (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id), request_id text NOT NULL,
 provider text NOT NULL CHECK (provider IN ('paypal','waffo')), environment text NOT NULL,
 account_id text NOT NULL, product_id text NOT NULL, product_name text NOT NULL,
 amount integer NOT NULL CHECK (amount > 0), currency text NOT NULL CHECK (currency = 'USD'),
 credits integer NOT NULL CHECK (credits > 0), expiry_days integer NOT NULL CHECK (expiry_days > 0),
 status text NOT NULL DEFAULT 'CREATING' CHECK (status IN ('CREATING','PENDING','PAID','REVIEW')),
 external_id text, checkout_url text, created_at timestamptz NOT NULL DEFAULT now(),
 paid_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
 lease_token text, lease_until timestamptz, next_check_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,request_id), UNIQUE(provider,environment,account_id,external_id)
);
CREATE INDEX payment_orders_user_time ON payment_orders(user_id,created_at DESC);
CREATE INDEX payment_orders_pending ON payment_orders(updated_at) WHERE status IN ('CREATING','PENDING');
CREATE TABLE payment_fulfillments (
 order_id text PRIMARY KEY REFERENCES payment_orders(id), provider text NOT NULL,
 environment text NOT NULL, account_id text NOT NULL, payment_id text NOT NULL,
 package_id integer NOT NULL UNIQUE REFERENCES credit_packages(id),
 transaction_id integer NOT NULL UNIQUE REFERENCES credit_transactions(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider,environment,account_id,payment_id)
);
CREATE TABLE payment_events (
 provider text NOT NULL, environment text NOT NULL, account_id text NOT NULL, event_id text NOT NULL,
 event_type text NOT NULL, order_id text REFERENCES payment_orders(id),
 status text NOT NULL CHECK (status IN ('VERIFIED','PROCESSED','IGNORED')),
 created_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz,
 PRIMARY KEY(provider,environment,account_id,event_id)
);
