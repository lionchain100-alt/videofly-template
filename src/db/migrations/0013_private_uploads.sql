CREATE TABLE private_uploads (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id),
 storage_backend text NOT NULL CHECK(storage_backend IN ('local','s3')),storage_scope text,storage_key text NOT NULL UNIQUE,
 mime text NOT NULL, byte_length integer NOT NULL CHECK(byte_length>0 AND byte_length<=10485760),sha256 text NOT NULL,
 status text NOT NULL CHECK(status IN ('WRITING','READY','FAILED')),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
