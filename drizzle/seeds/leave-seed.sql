-- =============================================================================
-- Leave Management Seed Data
-- Strategy:
--   1. Always insert leave_types (idempotent via INSERT OR IGNORE).
--   2. Insert leave_requests and leave_balances only if active employees exist
--      in employee_profiles, using subqueries (safe no-op when table is empty).
--   3. Balances for leave types that already have rows are NOT re-inserted
--      (INSERT OR IGNORE), so actual approve/reject history is preserved.
--      Hospitalisation leave balances are new rows and always inserted fresh.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Leave Types (master data)
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
-- 2. Leave Requests — original mock batch (lr-mock-001 … 006)
--    INSERT OR IGNORE: safe to re-run; already-processed rows are untouched.
-- -----------------------------------------------------------------------------

-- Employee 1 — Annual Leave, pending
INSERT OR IGNORE INTO leave_requests
    (id, person_id, leave_type_id, start_date, end_date, total_days, status,
     reason, source, submitted_at, payroll_effect, created_at, updated_at)
SELECT
    'lr-mock-001', ep.person_id, 'lt-annual',
    '2026-06-09', '2026-06-13', 5, 'pending',
    'Family vacation', 'mock', CURRENT_TIMESTAMP,
    'not_applicable', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM employee_profiles ep
WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1;

-- Employee 1 — Sick Leave, approved
INSERT OR IGNORE INTO leave_requests
    (id, person_id, leave_type_id, start_date, end_date, total_days, status,
     reason, source, submitted_at, approved_by_user_id, approved_at,
     payroll_effect, created_at, updated_at)
SELECT
    'lr-mock-002', ep.person_id, 'lt-sick',
    '2026-05-12', '2026-05-13', 2, 'approved',
    'Fever and flu', 'mock', datetime('2026-05-11'),
    'admin', datetime('2026-05-11', '+2 hours'),
    'not_applicable', datetime('2026-05-11'), datetime('2026-05-11', '+2 hours')
FROM employee_profiles ep
WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1;

-- Employee 2 — Annual Leave, pending
INSERT OR IGNORE INTO leave_requests
    (id, person_id, leave_type_id, start_date, end_date, total_days, status,
     reason, source, submitted_at, payroll_effect, created_at, updated_at)
SELECT
    'lr-mock-003', ep.person_id, 'lt-annual',
    '2026-07-01', '2026-07-04', 4, 'pending',
    'Personal travel', 'mock', CURRENT_TIMESTAMP,
    'not_applicable', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM employee_profiles ep
WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 1;

-- Employee 2 — Annual Leave, rejected
INSERT OR IGNORE INTO leave_requests
    (id, person_id, leave_type_id, start_date, end_date, total_days, status,
     reason, source, submitted_at, rejected_by_user_id, rejected_at,
     rejection_reason, payroll_effect, created_at, updated_at)
SELECT
    'lr-mock-004', ep.person_id, 'lt-annual',
    '2026-05-01', '2026-05-05', 5, 'rejected',
    'Team gathering', 'mock', datetime('2026-04-25'),
    'admin', datetime('2026-04-26'),
    'Peak period — please reschedule after June.',
    'not_applicable', datetime('2026-04-25'), datetime('2026-04-26')
FROM employee_profiles ep
WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 1;

-- Employee 3 — Unpaid Leave, pending
INSERT OR IGNORE INTO leave_requests
    (id, person_id, leave_type_id, start_date, end_date, total_days, status,
     reason, source, submitted_at, payroll_effect, created_at, updated_at)
SELECT
    'lr-mock-005', ep.person_id, 'lt-unpaid',
    '2026-08-04', '2026-08-08', 5, 'pending',
    'Personal matters', 'mock', CURRENT_TIMESTAMP,
    'not_applicable', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM employee_profiles ep
WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 2;

-- Employee 3 — Sick Leave, approved
INSERT OR IGNORE INTO leave_requests
    (id, person_id, leave_type_id, start_date, end_date, total_days, status,
     reason, source, submitted_at, approved_by_user_id, approved_at,
     payroll_effect, created_at, updated_at)
SELECT
    'lr-mock-006', ep.person_id, 'lt-sick',
    '2026-04-14', '2026-04-14', 1, 'approved',
    'Dental procedure', 'mock', datetime('2026-04-13'),
    'admin', datetime('2026-04-13', '+1 hour'),
    'not_applicable', datetime('2026-04-13'), datetime('2026-04-13', '+1 hour')
FROM employee_profiles ep
WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 2;

-- -----------------------------------------------------------------------------
-- 3. Leave Requests — expanded pending batch (lr-mock-007 … 016)
--    10 new pending requests spread across all 3 employees and 4 leave types.
-- -----------------------------------------------------------------------------

-- Employee 1 (Alice) — Sick Leave, pending
INSERT OR IGNORE INTO leave_requests
    (id, person_id, leave_type_id, start_date, end_date, total_days, status,
     reason, source, submitted_at, payroll_effect, created_at, updated_at)
SELECT
    'lr-mock-007', ep.person_id, 'lt-sick',
    '2026-07-07', '2026-07-08', 2, 'pending',
    'Medical check-up and blood test', 'mock', datetime('2026-07-01'),
    'not_applicable', datetime('2026-07-01'), datetime('2026-07-01')
FROM employee_profiles ep
WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1;

-- Employee 1 (Alice) — Hospitalisation Leave, pending
INSERT OR IGNORE INTO leave_requests
    (id, person_id, leave_type_id, start_date, end_date, total_days, status,
     reason, source, submitted_at, payroll_effect, created_at, updated_at)
SELECT
    'lr-mock-008', ep.person_id, 'lt-hosp',
    '2026-08-11', '2026-08-13', 3, 'pending',
    'Minor surgery — recovery ward observation required', 'mock', datetime('2026-08-01'),
    'not_applicable', datetime('2026-08-01'), datetime('2026-08-01')
FROM employee_profiles ep
WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1;

-- Employee 1 (Alice) — Annual Leave, pending (year-end)
INSERT OR IGNORE INTO leave_requests
    (id, person_id, leave_type_id, start_date, end_date, total_days, status,
     reason, source, submitted_at, payroll_effect, created_at, updated_at)
SELECT
    'lr-mock-009', ep.person_id, 'lt-annual',
    '2026-11-02', '2026-11-04', 3, 'pending',
    'Year-end holiday with family', 'mock', datetime('2026-10-20'),
    'not_applicable', datetime('2026-10-20'), datetime('2026-10-20')
FROM employee_profiles ep
WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1;

-- Employee 2 (Rahim) — Annual Leave, pending
INSERT OR IGNORE INTO leave_requests
    (id, person_id, leave_type_id, start_date, end_date, total_days, status,
     reason, source, submitted_at, payroll_effect, created_at, updated_at)
SELECT
    'lr-mock-010', ep.person_id, 'lt-annual',
    '2026-06-23', '2026-06-25', 3, 'pending',
    'Short getaway with spouse', 'mock', datetime('2026-06-10'),
    'not_applicable', datetime('2026-06-10'), datetime('2026-06-10')
FROM employee_profiles ep
WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 1;

-- Employee 2 (Rahim) — Sick Leave, pending
INSERT OR IGNORE INTO leave_requests
    (id, person_id, leave_type_id, start_date, end_date, total_days, status,
     reason, source, submitted_at, payroll_effect, created_at, updated_at)
SELECT
    'lr-mock-011', ep.person_id, 'lt-sick',
    '2026-07-14', '2026-07-14', 1, 'pending',
    'Feeling unwell, will see GP in the morning', 'mock', datetime('2026-07-13'),
    'not_applicable', datetime('2026-07-13'), datetime('2026-07-13')
FROM employee_profiles ep
WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 1;

-- Employee 2 (Rahim) — Unpaid Leave, pending
INSERT OR IGNORE INTO leave_requests
    (id, person_id, leave_type_id, start_date, end_date, total_days, status,
     reason, source, submitted_at, payroll_effect, created_at, updated_at)
SELECT
    'lr-mock-012', ep.person_id, 'lt-unpaid',
    '2026-09-01', '2026-09-03', 3, 'pending',
    'Personal commitment — family matter', 'mock', datetime('2026-08-20'),
    'not_applicable', datetime('2026-08-20'), datetime('2026-08-20')
FROM employee_profiles ep
WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 1;

-- Employee 3 (Wang Lei) — Annual Leave, pending
INSERT OR IGNORE INTO leave_requests
    (id, person_id, leave_type_id, start_date, end_date, total_days, status,
     reason, source, submitted_at, payroll_effect, created_at, updated_at)
SELECT
    'lr-mock-013', ep.person_id, 'lt-annual',
    '2026-06-29', '2026-07-02', 4, 'pending',
    'National Day long weekend extension', 'mock', datetime('2026-06-15'),
    'not_applicable', datetime('2026-06-15'), datetime('2026-06-15')
FROM employee_profiles ep
WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 2;

-- Employee 3 (Wang Lei) — Sick Leave, pending
INSERT OR IGNORE INTO leave_requests
    (id, person_id, leave_type_id, start_date, end_date, total_days, status,
     reason, source, submitted_at, payroll_effect, created_at, updated_at)
SELECT
    'lr-mock-014', ep.person_id, 'lt-sick',
    '2026-08-18', '2026-08-19', 2, 'pending',
    'Severe migraine, doctor recommended two days rest', 'mock', datetime('2026-08-17'),
    'not_applicable', datetime('2026-08-17'), datetime('2026-08-17')
FROM employee_profiles ep
WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 2;

-- Employee 3 (Wang Lei) — Hospitalisation Leave, pending
INSERT OR IGNORE INTO leave_requests
    (id, person_id, leave_type_id, start_date, end_date, total_days, status,
     reason, source, submitted_at, payroll_effect, created_at, updated_at)
SELECT
    'lr-mock-015', ep.person_id, 'lt-hosp',
    '2026-09-22', '2026-09-26', 5, 'pending',
    'Scheduled knee procedure — hospital admission confirmed', 'mock', datetime('2026-09-01'),
    'not_applicable', datetime('2026-09-01'), datetime('2026-09-01')
FROM employee_profiles ep
WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 2;

-- Employee 3 (Wang Lei) — Annual Leave, pending (Q4)
INSERT OR IGNORE INTO leave_requests
    (id, person_id, leave_type_id, start_date, end_date, total_days, status,
     reason, source, submitted_at, payroll_effect, created_at, updated_at)
SELECT
    'lr-mock-016', ep.person_id, 'lt-annual',
    '2026-10-05', '2026-10-07', 3, 'pending',
    'October school holidays — family trip', 'mock', datetime('2026-09-20'),
    'not_applicable', datetime('2026-09-20'), datetime('2026-09-20')
FROM employee_profiles ep
WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 2;

-- -----------------------------------------------------------------------------
-- 4. Leave Balances — original rows (INSERT OR IGNORE keeps actual usage)
-- -----------------------------------------------------------------------------

-- Employee 1 — Annual Leave balance
INSERT OR IGNORE INTO leave_balances
    (id, person_id, leave_type_id, year, entitled_days, used_days, pending_days, created_at, updated_at)
SELECT 'lb-mock-e1-annual', ep.person_id, 'lt-annual',
    2026, 14, 0, 8,   -- pending: lr-001(5d) + lr-009(3d)
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM employee_profiles ep
WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1;

-- Employee 1 — Sick Leave balance
INSERT OR IGNORE INTO leave_balances
    (id, person_id, leave_type_id, year, entitled_days, used_days, pending_days, created_at, updated_at)
SELECT 'lb-mock-e1-sick', ep.person_id, 'lt-sick',
    2026, 14, 2, 2,   -- used: lr-002(2d); pending: lr-007(2d)
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM employee_profiles ep
WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1;

-- Employee 1 — Hospitalisation Leave balance (new)
INSERT OR IGNORE INTO leave_balances
    (id, person_id, leave_type_id, year, entitled_days, used_days, pending_days, created_at, updated_at)
SELECT 'lb-mock-e1-hosp', ep.person_id, 'lt-hosp',
    2026, 60, 0, 3,   -- pending: lr-008(3d)
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM employee_profiles ep
WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1;

-- Employee 2 — Annual Leave balance
INSERT OR IGNORE INTO leave_balances
    (id, person_id, leave_type_id, year, entitled_days, used_days, pending_days, created_at, updated_at)
SELECT 'lb-mock-e2-annual', ep.person_id, 'lt-annual',
    2026, 14, 0, 7,   -- pending: lr-003(4d) + lr-010(3d)
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM employee_profiles ep
WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 1;

-- Employee 2 — Sick Leave balance
INSERT OR IGNORE INTO leave_balances
    (id, person_id, leave_type_id, year, entitled_days, used_days, pending_days, created_at, updated_at)
SELECT 'lb-mock-e2-sick', ep.person_id, 'lt-sick',
    2026, 14, 0, 1,   -- pending: lr-011(1d)
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM employee_profiles ep
WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 1;

-- Employee 2 — Unpaid Leave balance (new)
INSERT OR IGNORE INTO leave_balances
    (id, person_id, leave_type_id, year, entitled_days, used_days, pending_days, created_at, updated_at)
SELECT 'lb-mock-e2-unpaid', ep.person_id, 'lt-unpaid',
    2026, 5, 0, 3,    -- pending: lr-012(3d)
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM employee_profiles ep
WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 1;

-- Employee 3 — Annual Leave balance
INSERT OR IGNORE INTO leave_balances
    (id, person_id, leave_type_id, year, entitled_days, used_days, pending_days, created_at, updated_at)
SELECT 'lb-mock-e3-annual', ep.person_id, 'lt-annual',
    2026, 14, 0, 7,   -- pending: lr-013(4d) + lr-016(3d)
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM employee_profiles ep
WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 2;

-- Employee 3 — Sick Leave balance
INSERT OR IGNORE INTO leave_balances
    (id, person_id, leave_type_id, year, entitled_days, used_days, pending_days, created_at, updated_at)
SELECT 'lb-mock-e3-sick', ep.person_id, 'lt-sick',
    2026, 14, 1, 2,   -- used: lr-006(1d); pending: lr-014(2d)
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM employee_profiles ep
WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 2;

-- Employee 3 — Unpaid Leave balance
INSERT OR IGNORE INTO leave_balances
    (id, person_id, leave_type_id, year, entitled_days, used_days, pending_days, created_at, updated_at)
SELECT 'lb-mock-e3-unpaid', ep.person_id, 'lt-unpaid',
    2026, 5, 0, 5,    -- pending: lr-005(5d)
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM employee_profiles ep
WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 2;

-- Employee 3 — Hospitalisation Leave balance (new)
INSERT OR IGNORE INTO leave_balances
    (id, person_id, leave_type_id, year, entitled_days, used_days, pending_days, created_at, updated_at)
SELECT 'lb-mock-e3-hosp', ep.person_id, 'lt-hosp',
    2026, 60, 0, 5,   -- pending: lr-015(5d)
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM employee_profiles ep
WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 2;

-- -----------------------------------------------------------------------------
-- 5. Leave Approval Records (original — INSERT OR IGNORE preserves audit trail)
-- -----------------------------------------------------------------------------

INSERT OR IGNORE INTO leave_approval_records
    (id, leave_request_id, action, actor_id, actor_name, from_status, to_status, comment, created_at, updated_at)
VALUES
    ('lar-mock-001', 'lr-mock-002', 'approved',
     'admin', 'admin', 'pending', 'approved', NULL,
     datetime('2026-05-11', '+2 hours'), datetime('2026-05-11', '+2 hours')),

    ('lar-mock-002', 'lr-mock-004', 'rejected',
     'admin', 'admin', 'pending', 'rejected',
     'Peak period — please reschedule after June.',
     datetime('2026-04-26'), datetime('2026-04-26')),

    ('lar-mock-003', 'lr-mock-006', 'approved',
     'admin', 'admin', 'pending', 'approved', NULL,
     datetime('2026-04-13', '+1 hour'), datetime('2026-04-13', '+1 hour'));
