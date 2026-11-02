CREATE TABLE owner_initializations (
 site_id text PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id),
 email text NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
