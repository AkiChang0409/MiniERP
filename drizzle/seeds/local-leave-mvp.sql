-- Local, non-destructive leave seed for the HR AI console (Phase 1) MVP test.
--
-- Unlike local-mock-full.sql, this does NOT delete users / accounts / sessions /
-- user_person_links — your real login accounts are preserved.
--
-- It seeds the 4 standard leave types, then (idempotently) gives the CURRENTLY
-- BOUND employee — resolved dynamically from the active user_person_links row,
-- so no hard-coded person id — 2026 balances and one pending annual-leave
-- request, so /employee/ai-console has data to list / approve immediately.

INSERT OR IGNORE INTO leave_types
	(id, code, name, description, is_paid, requires_document, requires_approval, affects_payroll, status, created_at, updated_at, deleted_at)
VALUES
	('lt-annual', 'ANNUAL', 'Annual Leave', 'Standard paid annual leave entitlement.', 1, 0, 1, 0, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('lt-sick',   'SICK',   'Sick Leave',   'Leave for illness or medical appointments.', 1, 0, 1, 0, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('lt-hosp',   'HOSP',   'Hospitalisation Leave', 'Extended sick leave requiring documents.', 1, 1, 1, 0, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('lt-unpaid', 'UNPAID', 'Unpaid Leave', 'Leave without pay.', 0, 0, 1, 1, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

-- 2026 balances for the bound employee. pending_days on ANNUAL = 3 to match the
-- pending request seeded below (remaining = 14 - 0 - 3 = 11).
INSERT OR IGNORE INTO leave_balances
	(id, person_id, leave_type_id, year, entitled_days, used_days, pending_days, created_at, updated_at, deleted_at)
SELECT 'lb-mvp-annual', upl.person_id, 'lt-annual', 2026, 14, 0, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
	FROM user_person_links upl WHERE upl.status = 'active' AND upl.deleted_at IS NULL LIMIT 1;
INSERT OR IGNORE INTO leave_balances
	(id, person_id, leave_type_id, year, entitled_days, used_days, pending_days, created_at, updated_at, deleted_at)
SELECT 'lb-mvp-sick', upl.person_id, 'lt-sick', 2026, 14, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
	FROM user_person_links upl WHERE upl.status = 'active' AND upl.deleted_at IS NULL LIMIT 1;
INSERT OR IGNORE INTO leave_balances
	(id, person_id, leave_type_id, year, entitled_days, used_days, pending_days, created_at, updated_at, deleted_at)
SELECT 'lb-mvp-hosp', upl.person_id, 'lt-hosp', 2026, 60, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
	FROM user_person_links upl WHERE upl.status = 'active' AND upl.deleted_at IS NULL LIMIT 1;
INSERT OR IGNORE INTO leave_balances
	(id, person_id, leave_type_id, year, entitled_days, used_days, pending_days, created_at, updated_at, deleted_at)
SELECT 'lb-mvp-unpaid', upl.person_id, 'lt-unpaid', 2026, 5, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
	FROM user_person_links upl WHERE upl.status = 'active' AND upl.deleted_at IS NULL LIMIT 1;

-- One pending annual-leave request for the bound employee so owner/admin can
-- list + approve it right away from the console.
INSERT OR IGNORE INTO leave_requests
	(id, person_id, leave_type_id, start_date, end_date, total_days, status, reason, source, submitted_at, payroll_effect, created_at, updated_at, deleted_at)
SELECT 'lr-mvp-001', upl.person_id, 'lt-annual', '2026-07-06', '2026-07-08', 3, 'pending', 'School holiday travel', 'mock', '2026-06-01T10:00:00Z', 'not_applicable', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
	FROM user_person_links upl WHERE upl.status = 'active' AND upl.deleted_at IS NULL LIMIT 1;
