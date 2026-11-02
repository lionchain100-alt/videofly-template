ALTER TABLE task_assets ADD COLUMN storage_backend text NOT NULL DEFAULT 'local' CHECK(storage_backend IN ('local','s3'));
ALTER TABLE task_assets ADD COLUMN storage_scope text;
CREATE TABLE worker_heartbeats (
 site_id text NOT NULL, kind text NOT NULL CHECK(kind IN ('text','video','payments')),
 instance_id text NOT NULL, started_at timestamptz NOT NULL DEFAULT now(),
 heartbeat_at timestamptz NOT NULL DEFAULT now(), progress_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL CHECK(status IN ('RUNNING','STOPPED')), last_error text,
 PRIMARY KEY(site_id,kind,instance_id)
);
CREATE INDEX worker_heartbeats_fresh_idx ON worker_heartbeats(site_id,kind,heartbeat_at DESC);
