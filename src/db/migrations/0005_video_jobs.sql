CREATE TABLE video_jobs (
  task_id text PRIMARY KEY REFERENCES tasks(id),
  stage text NOT NULL DEFAULT 'QUEUED' CHECK(stage IN ('QUEUED','SUBMITTING','POLLING','STORING','RECONCILING','DONE')),
  provider text NOT NULL,
  provider_task_id text,
  source_url text,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  lease_token text,
  lease_until timestamptz,
  poll_attempts integer NOT NULL DEFAULT 0,
  storage_attempts integer NOT NULL DEFAULT 0,
  last_error text,
  deadline_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider,provider_task_id)
);
CREATE INDEX video_jobs_due_idx ON video_jobs(next_run_at) WHERE stage NOT IN ('DONE','RECONCILING');
CREATE TABLE task_assets (
  task_id text PRIMARY KEY REFERENCES tasks(id),
  user_id text NOT NULL REFERENCES "user"(id),
  storage_key text NOT NULL UNIQUE,
  mime text NOT NULL,
  byte_length integer NOT NULL CHECK(byte_length>0),
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE video_reviews (
  request_id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id),
  actor_id text NOT NULL REFERENCES "user"(id),
  action text NOT NULL CHECK(action IN ('LINK_TASK','CONFIRM_FAILURE','RETRY_STORAGE')),
  reason text NOT NULL,
  provider_task_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE VIEW admin_task_rows AS
SELECT uuid,user_id,model,provider,status::text,prompt,credits_used,created_at AT TIME ZONE 'UTC' AS created_at,
error_message,is_deleted,external_task_id,'video'::text AS kind FROM videos
UNION ALL
SELECT id AS uuid,user_id,model,provider,status,coalesce(input->>'text',input->>'prompt') AS prompt,credits AS credits_used,created_at,
error_message,false AS is_deleted,provider_request_id AS external_task_id,tool_id AS kind FROM tasks;
