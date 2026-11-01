ALTER TABLE "user" ADD COLUMN IF NOT EXISTS disabled boolean NOT NULL DEFAULT false;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS disabled_reason text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS disabled_at timestamptz;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS actor_user_id text REFERENCES "user"(id);
CREATE TABLE IF NOT EXISTS admin_operations (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL UNIQUE,
  request_hash text NOT NULL,
  actor_user_id text NOT NULL REFERENCES "user"(id),
  target_user_id text NOT NULL REFERENCES "user"(id),
  action text NOT NULL,
  reason text NOT NULL,
  credits integer,
  package_id integer REFERENCES credit_packages(id),
  transaction_id integer REFERENCES credit_transactions(id),
  balance_after integer,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_operations_action_check CHECK (action IN ('CREDIT_GRANT', 'USER_DISABLE', 'USER_ENABLE')),
  CONSTRAINT admin_operations_credits_check CHECK (credits IS NULL OR credits > 0)
);
CREATE INDEX IF NOT EXISTS admin_operations_target_time_idx ON admin_operations(target_user_id, created_at);
CREATE INDEX IF NOT EXISTS admin_operations_actor_time_idx ON admin_operations(actor_user_id, created_at);
