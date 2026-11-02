ALTER TABLE payment_events ADD COLUMN normalized_event jsonb;
ALTER TABLE payment_events ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX payment_events_retry_idx ON payment_events(next_attempt_at) WHERE status = 'VERIFIED';
