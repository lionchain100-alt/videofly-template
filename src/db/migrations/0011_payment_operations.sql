ALTER TABLE payment_events ADD COLUMN attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE payment_events ADD COLUMN last_attempt_at timestamptz;
ALTER TABLE payment_events ADD COLUMN last_error text;
ALTER TABLE payment_events ADD COLUMN review_status text NOT NULL DEFAULT 'OPEN' CHECK (review_status IN ('OPEN','ACKNOWLEDGED'));
CREATE TABLE payment_operations (
 id text PRIMARY KEY, request_id text NOT NULL UNIQUE, request_hash text NOT NULL,
 actor_user_id text NOT NULL REFERENCES "user"(id), action text NOT NULL CHECK(action IN ('REPLAY_EVENT','RECONCILE_ORDER','RECHECK_REFUND','REVIEW_EVENT')),
 reason text NOT NULL, target jsonb NOT NULL, order_id text REFERENCES payment_orders(id),
 status text NOT NULL CHECK(status IN ('QUEUED','RUNNING','SUCCEEDED','NEEDS_REVIEW')),
 result_code text, message text, attempts integer NOT NULL DEFAULT 0,
 lease_token text, lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
CREATE INDEX payment_operations_due_idx ON payment_operations(status,lease_until);
CREATE INDEX payment_events_order_created_idx ON payment_events(order_id,created_at DESC);
