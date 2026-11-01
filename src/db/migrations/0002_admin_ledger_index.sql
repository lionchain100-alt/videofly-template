-- Each manually credited transaction has at most one management audit record.
-- PostgreSQL unique indexes allow multiple NULLs for non-credit operations.
CREATE UNIQUE INDEX IF NOT EXISTS admin_operations_transaction_unique_idx ON admin_operations(transaction_id);
