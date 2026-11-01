ALTER TYPE "CreditTransType" ADD VALUE IF NOT EXISTS 'TASK_HOLD';
ALTER TYPE "CreditTransType" ADD VALUE IF NOT EXISTS 'TASK_SETTLE';
ALTER TYPE "CreditTransType" ADD VALUE IF NOT EXISTS 'TASK_RELEASE';
CREATE TABLE tasks (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id),
  request_id text NOT NULL,
  input_hash text NOT NULL,
  tool_id text NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED')),
  input jsonb NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  execution_config jsonb NOT NULL,
  credits integer NOT NULL CHECK (credits > 0),
  result text,
  error_code text,
  error_message text,
  provider_request_id text,
  usage jsonb,
  lease_token text,
  lease_until timestamptz,
  queue_deadline timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  UNIQUE (user_id,request_id)
);
CREATE INDEX tasks_user_time_idx ON tasks(user_id,created_at DESC);
CREATE INDEX tasks_queue_idx ON tasks(status,created_at) WHERE status IN ('QUEUED','RUNNING');
CREATE TABLE task_attempts (
  id text PRIMARY KEY,
  task_id text NOT NULL UNIQUE REFERENCES tasks(id),
  status text NOT NULL,
  error_code text,
  provider_request_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
ALTER TABLE credit_holds ALTER COLUMN video_uuid DROP NOT NULL;
ALTER TABLE credit_holds ADD COLUMN task_id text UNIQUE REFERENCES tasks(id);
ALTER TABLE credit_holds ADD CONSTRAINT credit_holds_one_reference CHECK (num_nonnulls(video_uuid,task_id)=1);
ALTER TABLE credit_transactions ADD COLUMN task_id text REFERENCES tasks(id);
CREATE UNIQUE INDEX credit_transactions_task_phase_unique ON credit_transactions(task_id,trans_type) WHERE task_id IS NOT NULL;
