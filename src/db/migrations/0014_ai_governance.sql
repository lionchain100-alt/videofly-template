CREATE TABLE ai_policy_versions (
 id text PRIMARY KEY, site_id text NOT NULL, revision integer NOT NULL CHECK(revision>0),
 config jsonb NOT NULL, actor_id text REFERENCES "user"(id), reason text NOT NULL,
 request_id text NOT NULL UNIQUE, request_hash text NOT NULL, origin text NOT NULL CHECK(origin IN ('BOOTSTRAP','ADMIN','LOCAL_TEST')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(site_id,revision)
);
CREATE TABLE ai_policy_current (site_id text PRIMARY KEY, version_id text NOT NULL REFERENCES ai_policy_versions(id));
CREATE TABLE ai_cost_usage (
 task_id text PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
 user_id text NOT NULL REFERENCES "user"(id), site_id text NOT NULL,
 policy_version text NOT NULL, profile_snapshot jsonb NOT NULL,
 estimate_micros bigint NOT NULL CHECK(estimate_micros>0),
 charged_micros bigint NOT NULL CHECK(charged_micros>=0),
 usage_micros bigint, confirmed_micros bigint,
 status text NOT NULL CHECK(status IN ('RESERVED','DISPATCHED','ESTIMATED','USAGE_ESTIMATED','UNCERTAIN','RELEASED','CONFIRMED')),
 anomaly text, dispatched_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_cost_usage_site_time_idx ON ai_cost_usage(site_id,created_at);
CREATE INDEX ai_cost_usage_user_time_idx ON ai_cost_usage(user_id,created_at);
CREATE TABLE ai_cost_reviews (
 id text PRIMARY KEY, request_id text NOT NULL UNIQUE, request_hash text NOT NULL,
 task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 actor_id text NOT NULL REFERENCES "user"(id), amount_micros bigint NOT NULL CHECK(amount_micros>=0),
 evidence_reference text NOT NULL, reason text NOT NULL, previous_cost jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ai_governance_incidents (
 id text PRIMARY KEY, site_id text NOT NULL,user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 request_id text NOT NULL, code text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(site_id,user_id,request_id,code)
);
