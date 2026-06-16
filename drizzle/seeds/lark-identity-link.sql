-- Manually bind a Lark (Feishu) account to a MiniERP user (MVP — no self-serve UI yet).
--
-- Why: the Lark review-card flow pushes a card to the *uploader's* Lark DM and
-- resolves the acting user from the Lark open_id on Confirm/Reject. That needs a
-- row in external_identity_links. There is no binding UI yet, so insert it here.
--
-- How to get the values:
--   open_id          Send any message to the bot (or tap a card) and read the
--                    worker logs — the Lark webhook / card-callback logs the
--                    sender/operator open_id (looks like `ou_xxxxxxxx...`).
--   minierp_user_id  SELECT id, email FROM users;  (the account that uploads docs)
--   id               any unique string (a UUID is fine).
--
-- Run (remote / production D1):
--   wrangler d1 execute smartfin-db-v4 --remote --command "INSERT INTO external_identity_links (id, provider, external_user_id, user_id, status, created_at, updated_at) VALUES ('<uuid>', 'lark', '<open_id>', '<minierp_user_id>', 'active', datetime('now'), datetime('now'));"
--
-- Or edit the placeholders below and:
--   wrangler d1 execute smartfin-db-v4 --remote --file drizzle/seeds/lark-identity-link.sql
--
-- Re-binding the same open_id to a different user first requires soft-deleting
-- the existing row (set deleted_at) — a partial unique index enforces one ACTIVE
-- link per (provider, external_user_id).

INSERT INTO external_identity_links
  (id, provider, external_user_id, user_id, status, created_at, updated_at)
VALUES
  ('REPLACE_WITH_UUID', 'lark', 'REPLACE_WITH_OPEN_ID', 'REPLACE_WITH_MINIERP_USER_ID', 'active', datetime('now'), datetime('now'));
