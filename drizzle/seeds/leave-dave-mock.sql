-- =============================================================================
-- Leave mock data for the single test employee "Dave"
--
-- Purpose: give the employee self-service portal (/employee/leave) realistic
-- balances + request history to test against. Idempotent (INSERT OR IGNORE).
-- person_id is resolved by name so it survives a different local DB id.
--
-- Run:
--   npx wrangler d1 execute smartfin-db-v4 --local --file drizzle/seeds/leave-dave-mock.sql
--
-- pending_days is kept consistent with the pending requests below:
--   ANNUAL  entitled 14, used 3 (lr-dave-002), pending 5 (lr-dave-001) -> remaining 6
--   SICK    entitled 14, used 2 (lr-dave-003), pending 0               -> remaining 12
--   HOSP    entitled 60, used 0,               pending 0               -> remaining 60
--   UNPAID  entitled  5, used 0,               pending 0               -> remaining 5
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Leave types (master data) — idempotent
-- -----------------------------------------------------------------------------
INSERT OR IGNORE INTO leave_types
    (id, code, name, description, is_paid, requires_document, requires_approval, affects_payroll, status, created_at, updated_at)
VALUES
    ('lt-annual', 'ANNUAL', 'Annual Leave',
     'Standard paid annual leave entitlement.',
     1, 0, 1, 0, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('lt-sick', 'SICK', 'Sick Leave',
     'Leave for illness or medical appointments.',
     1, 0, 1, 0, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('lt-hosp', 'HOSP', 'Hospitalisation Leave',
     'Extended sick leave requiring hospitalisation or surgery.',
     1, 1, 1, 0, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('lt-unpaid', 'UNPAID', 'Unpaid Leave',
     'Leave without pay. Affects payroll calculation.',
     0, 0, 1, 1, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- -----------------------------------------------------------------------------
-- 2. Leave balances for Dave (year 2026)
-- -----------------------------------------------------------------------------
INSERT OR IGNORE INTO leave_balances
    (id, person_id, leave_type_id, year, entitled_days, used_days, pending_days, created_at, updated_at)
SELECT 'lb-dave-annual', p.id, 'lt-annual', 2026, 14, 3, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM persons p WHERE p.name = 'Dave' LIMIT 1;

INSERT OR IGNORE INTO leave_balances
    (id, person_id, leave_type_id, year, entitled_days, used_days, pending_days, created_at, updated_at)
SELECT 'lb-dave-sick', p.id, 'lt-sick', 2026, 14, 2, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM persons p WHERE p.name = 'Dave' LIMIT 1;

INSERT OR IGNORE INTO leave_balances
    (id, person_id, leave_type_id, year, entitled_days, used_days, pending_days, created_at, updated_at)
SELECT 'lb-dave-hosp', p.id, 'lt-hosp', 2026, 60, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM persons p WHERE p.name = 'Dave' LIMIT 1;

INSERT OR IGNORE INTO leave_balances
    (id, person_id, leave_type_id, year, entitled_days, used_days, pending_days, created_at, updated_at)
SELECT 'lb-dave-unpaid', p.id, 'lt-unpaid', 2026, 5, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM persons p WHERE p.name = 'Dave' LIMIT 1;

-- -----------------------------------------------------------------------------
-- 3. Leave requests for Dave — one per status, source employee_portal
-- -----------------------------------------------------------------------------

-- Pending (contributes pending 5 to ANNUAL)
INSERT OR IGNORE INTO leave_requests
    (id, person_id, leave_type_id, start_date, end_date, total_days, status,
     reason, source, submitted_at, payroll_effect, created_at, updated_at)
SELECT 'lr-dave-001', p.id, 'lt-annual',
    '2026-06-15', '2026-06-19', 5, 'pending',
    'Family holiday', 'employee_portal', CURRENT_TIMESTAMP,
    'not_applicable', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM persons p WHERE p.name = 'Dave' LIMIT 1;

-- Approved annual (used 3)
INSERT OR IGNORE INTO leave_requests
    (id, person_id, leave_type_id, start_date, end_date, total_days, status,
     reason, source, submitted_at, approved_by_user_id, approved_at,
     payroll_effect, created_at, updated_at)
SELECT 'lr-dave-002', p.id, 'lt-annual',
    '2026-03-10', '2026-03-12', 3, 'approved',
    'Long weekend trip', 'employee_portal', datetime('2026-03-01'),
    'admin', datetime('2026-03-02'),
    'not_applicable', datetime('2026-03-01'), datetime('2026-03-02')
FROM persons p WHERE p.name = 'Dave' LIMIT 1;

-- Approved sick (used 2)
INSERT OR IGNORE INTO leave_requests
    (id, person_id, leave_type_id, start_date, end_date, total_days, status,
     reason, source, submitted_at, approved_by_user_id, approved_at,
     payroll_effect, created_at, updated_at)
SELECT 'lr-dave-003', p.id, 'lt-sick',
    '2026-02-02', '2026-02-03', 2, 'approved',
    'Flu', 'employee_portal', datetime('2026-02-01'),
    'admin', datetime('2026-02-01', '+3 hours'),
    'not_applicable', datetime('2026-02-01'), datetime('2026-02-01', '+3 hours')
FROM persons p WHERE p.name = 'Dave' LIMIT 1;

-- Rejected annual (no balance effect)
INSERT OR IGNORE INTO leave_requests
    (id, person_id, leave_type_id, start_date, end_date, total_days, status,
     reason, source, submitted_at, rejected_by_user_id, rejected_at,
     rejection_reason, payroll_effect, created_at, updated_at)
SELECT 'lr-dave-004', p.id, 'lt-annual',
    '2026-01-05', '2026-01-09', 5, 'rejected',
    'Year-start break', 'employee_portal', datetime('2026-01-02'),
    'admin', datetime('2026-01-03'),
    'Project deadline — please reschedule.', 'not_applicable',
    datetime('2026-01-02'), datetime('2026-01-03')
FROM persons p WHERE p.name = 'Dave' LIMIT 1;

-- -----------------------------------------------------------------------------
-- 4. Approval records (audit trail) — FKs reference Dave's real requests above
-- -----------------------------------------------------------------------------
INSERT OR IGNORE INTO leave_approval_records
    (id, leave_request_id, action, actor_id, actor_name, from_status, to_status, comment, created_at, updated_at)
VALUES
    ('lar-dave-002', 'lr-dave-002', 'approved', 'admin', 'admin', 'pending', 'approved', NULL,
     datetime('2026-03-02'), datetime('2026-03-02')),
    ('lar-dave-003', 'lr-dave-003', 'approved', 'admin', 'admin', 'pending', 'approved', NULL,
     datetime('2026-02-01', '+3 hours'), datetime('2026-02-01', '+3 hours')),
    ('lar-dave-004', 'lr-dave-004', 'rejected', 'admin', 'admin', 'pending', 'rejected',
     'Project deadline — please reschedule.',
     datetime('2026-01-03'), datetime('2026-01-03'));
