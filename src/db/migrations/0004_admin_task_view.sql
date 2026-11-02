CREATE VIEW admin_task_rows AS
SELECT uuid, user_id, model, provider, status::text, prompt, credits_used, created_at AT TIME ZONE 'UTC' AS created_at,
error_message, is_deleted, external_task_id, 'video'::text AS kind FROM videos
UNION ALL
SELECT id AS uuid, user_id, model, provider, status, input->>'text' AS prompt, credits AS credits_used, created_at,
error_message, false AS is_deleted, provider_request_id AS external_task_id, 'text-summary' AS kind FROM tasks;
