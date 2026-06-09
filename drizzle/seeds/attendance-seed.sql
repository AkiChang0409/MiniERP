-- Attendance Management seed data
-- Also appends full-month mock data for 2026-06-01 to 2026-07-31.
-- Covers 2026-05-04 (Mon) to 2026-05-17 (Sun) — 2 full ISO weeks per employee.
-- Uses INSERT OR IGNORE for idempotency (safe to re-run).
-- Uses subqueries from employee_profiles to get person_id; no-op if fewer than N employees exist.
--
-- payroll_effect follows AttendanceService.resolvePayrollEffect():
--   present / on_leave / rest_day  → not_applicable
--   late / absent / missing_checkout → pending_review
--
-- worked_minutes = gross duration (check_in → check_out), NOT payroll-grade net time.
--   09:00→18:00 = 540min  |  09:30→18:00 = 510min  |  09:00→20:00 = 660min

-- ═══════════════════════════════════════════════════════════════════════════════
-- EMPLOYEE 1 (first active employee_profile by created_at)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Week 1: 2026-05-04 (Mon) to 2026-05-10 (Sun)

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e1-20260504', ep.person_id, '2026-05-04', '09:00', '18:00', 540,
  0, 0, 0, 'present', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 0;

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e1-20260505', ep.person_id, '2026-05-05', '09:00', '18:00', 540,
  0, 0, 0, 'present', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 0;

-- late: check_in after 09:00, late_minutes=30
INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e1-20260506', ep.person_id, '2026-05-06', '09:30', '18:00', 510,
  30, 0, 0, 'late', 'mock', 'pending_review', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 0;

-- absent: no check_in, no check_out
INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e1-20260507', ep.person_id, '2026-05-07', NULL, NULL, NULL,
  0, 0, 0, 'absent', 'mock', 'pending_review', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 0;

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e1-20260508', ep.person_id, '2026-05-08', '09:00', '18:00', 540,
  0, 0, 0, 'present', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 0;

-- Sat/Sun rest_day
INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e1-20260509', ep.person_id, '2026-05-09', NULL, NULL, NULL,
  0, 0, 0, 'rest_day', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 0;

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e1-20260510', ep.person_id, '2026-05-10', NULL, NULL, NULL,
  0, 0, 0, 'rest_day', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 0;

-- Week 2: 2026-05-11 (Mon) to 2026-05-17 (Sun)

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e1-20260511', ep.person_id, '2026-05-11', '09:00', '18:00', 540,
  0, 0, 0, 'present', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 0;

-- overtime: check_out at 20:00, overtime=120min
INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e1-20260512', ep.person_id, '2026-05-12', '09:00', '20:00', 660,
  0, 0, 120, 'present', 'mock', 'not_applicable', 'Project deadline',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 0;

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e1-20260513', ep.person_id, '2026-05-13', '09:00', '18:00', 540,
  0, 0, 0, 'present', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 0;

-- late: check_in 09:45
INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e1-20260514', ep.person_id, '2026-05-14', '09:45', '18:00', 495,
  45, 0, 0, 'late', 'mock', 'pending_review', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 0;

-- on_leave
INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e1-20260515', ep.person_id, '2026-05-15', NULL, NULL, NULL,
  0, 0, 0, 'on_leave', 'mock', 'not_applicable', 'Annual leave',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 0;

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e1-20260516', ep.person_id, '2026-05-16', NULL, NULL, NULL,
  0, 0, 0, 'rest_day', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 0;

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e1-20260517', ep.person_id, '2026-05-17', NULL, NULL, NULL,
  0, 0, 0, 'rest_day', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 0;

-- ═══════════════════════════════════════════════════════════════════════════════
-- EMPLOYEE 2 (second active employee_profile by created_at)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Week 1

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e2-20260504', ep.person_id, '2026-05-04', '09:00', '18:00', 540,
  0, 0, 0, 'present', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 1;

-- missing_checkout: check_in present, check_out missing
INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e2-20260505', ep.person_id, '2026-05-05', '09:00', NULL, NULL,
  0, 0, 0, 'missing_checkout', 'mock', 'pending_review', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 1;

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e2-20260506', ep.person_id, '2026-05-06', '09:00', '18:00', 540,
  0, 0, 0, 'present', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 1;

-- on_leave
INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e2-20260507', ep.person_id, '2026-05-07', NULL, NULL, NULL,
  0, 0, 0, 'on_leave', 'mock', 'not_applicable', 'Medical leave',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 1;

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e2-20260508', ep.person_id, '2026-05-08', '09:00', '18:00', 540,
  0, 0, 0, 'present', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 1;

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e2-20260509', ep.person_id, '2026-05-09', NULL, NULL, NULL,
  0, 0, 0, 'rest_day', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 1;

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e2-20260510', ep.person_id, '2026-05-10', NULL, NULL, NULL,
  0, 0, 0, 'rest_day', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 1;

-- Week 2

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e2-20260511', ep.person_id, '2026-05-11', '09:00', '18:00', 540,
  0, 0, 0, 'present', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 1;

-- late: check_in 09:20
INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e2-20260512', ep.person_id, '2026-05-12', '09:20', '18:00', 520,
  20, 0, 0, 'late', 'mock', 'pending_review', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 1;

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e2-20260513', ep.person_id, '2026-05-13', '09:00', '18:00', 540,
  0, 0, 0, 'present', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 1;

-- absent
INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e2-20260514', ep.person_id, '2026-05-14', NULL, NULL, NULL,
  0, 0, 0, 'absent', 'mock', 'pending_review', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 1;

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e2-20260515', ep.person_id, '2026-05-15', '09:00', '18:00', 540,
  0, 0, 0, 'present', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 1;

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e2-20260516', ep.person_id, '2026-05-16', NULL, NULL, NULL,
  0, 0, 0, 'rest_day', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 1;

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e2-20260517', ep.person_id, '2026-05-17', NULL, NULL, NULL,
  0, 0, 0, 'rest_day', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 1;

-- ═══════════════════════════════════════════════════════════════════════════════
-- EMPLOYEE 3 (third active employee_profile by created_at)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Week 1

-- late: check_in 09:15
INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e3-20260504', ep.person_id, '2026-05-04', '09:15', '18:00', 525,
  15, 0, 0, 'late', 'mock', 'pending_review', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 2;

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e3-20260505', ep.person_id, '2026-05-05', '09:00', '18:00', 540,
  0, 0, 0, 'present', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 2;

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e3-20260506', ep.person_id, '2026-05-06', '09:00', '18:00', 540,
  0, 0, 0, 'present', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 2;

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e3-20260507', ep.person_id, '2026-05-07', '09:00', '18:00', 540,
  0, 0, 0, 'present', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 2;

-- late: check_in 09:30
INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e3-20260508', ep.person_id, '2026-05-08', '09:30', '18:00', 510,
  30, 0, 0, 'late', 'mock', 'pending_review', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 2;

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e3-20260509', ep.person_id, '2026-05-09', NULL, NULL, NULL,
  0, 0, 0, 'rest_day', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 2;

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e3-20260510', ep.person_id, '2026-05-10', NULL, NULL, NULL,
  0, 0, 0, 'rest_day', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 2;

-- Week 2

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e3-20260511', ep.person_id, '2026-05-11', '09:00', '18:00', 540,
  0, 0, 0, 'present', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 2;

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e3-20260512', ep.person_id, '2026-05-12', '09:00', '18:00', 540,
  0, 0, 0, 'present', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 2;

-- overtime: check_out 18:30, ot=30
INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e3-20260513', ep.person_id, '2026-05-13', '09:00', '18:30', 570,
  0, 0, 30, 'present', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 2;

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e3-20260514', ep.person_id, '2026-05-14', '09:00', '18:00', 540,
  0, 0, 0, 'present', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 2;

-- on_leave
INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e3-20260515', ep.person_id, '2026-05-15', NULL, NULL, NULL,
  0, 0, 0, 'on_leave', 'mock', 'not_applicable', 'Annual leave',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 2;

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e3-20260516', ep.person_id, '2026-05-16', NULL, NULL, NULL,
  0, 0, 0, 'rest_day', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 2;

INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT 'ar-e3-20260517', ep.person_id, '2026-05-17', NULL, NULL, NULL,
  0, 0, 0, 'rest_day', 'mock', 'not_applicable', NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM employee_profiles ep WHERE ep.status = 'active' AND ep.deleted_at IS NULL
ORDER BY ep.created_at LIMIT 1 OFFSET 2;

-- ---------------------------------------------------------------------------
-- JUNE 2026 FULL-MONTH MOCK DATA
-- Covers 2026-06-01 (Mon) to 2026-06-30 (Tue).
-- Uses the first three active employee_profiles, same slots as the May data.
-- Insert exceptions first, then fill all remaining weekdays/weekends with
-- default present/rest_day rows via INSERT OR IGNORE.
-- ---------------------------------------------------------------------------

WITH employee_slots(slot, person_id) AS (
  SELECT 1 AS slot, person_id FROM (
    SELECT ep.person_id
    FROM employee_profiles ep
    WHERE ep.status = 'active' AND ep.deleted_at IS NULL
    ORDER BY ep.created_at, ep.id
    LIMIT 1 OFFSET 0
  )
  UNION ALL
  SELECT 2 AS slot, person_id FROM (
    SELECT ep.person_id
    FROM employee_profiles ep
    WHERE ep.status = 'active' AND ep.deleted_at IS NULL
    ORDER BY ep.created_at, ep.id
    LIMIT 1 OFFSET 1
  )
  UNION ALL
  SELECT 3 AS slot, person_id FROM (
    SELECT ep.person_id
    FROM employee_profiles ep
    WHERE ep.status = 'active' AND ep.deleted_at IS NULL
    ORDER BY ep.created_at, ep.id
    LIMIT 1 OFFSET 2
  )
),
june_exceptions(
  slot, work_date, check_in_time, check_out_time, worked_minutes,
  late_minutes, early_leave_minutes, overtime_minutes,
  status, source, payroll_effect, notes
) AS (
  VALUES
    -- Employee 1: mixed review cases, leave, and overtime
    (1, '2026-06-03', '09:15', '18:00', 525, 15, 0, 0, 'late', 'mock', 'pending_review', 'June mock: late arrival'),
    (1, '2026-06-05', '09:00', NULL, NULL, 0, 0, 0, 'missing_checkout', 'mock', 'pending_review', 'June mock: missing checkout'),
    (1, '2026-06-09', NULL, NULL, NULL, 0, 0, 0, 'on_leave', 'mock', 'not_applicable', 'June mock: annual leave'),
    (1, '2026-06-10', NULL, NULL, NULL, 0, 0, 0, 'on_leave', 'mock', 'not_applicable', 'June mock: annual leave'),
    (1, '2026-06-12', '09:20', '18:30', 550, 20, 0, 30, 'late', 'mock', 'pending_review', 'June mock: late with overtime'),
    (1, '2026-06-16', NULL, NULL, NULL, 0, 0, 0, 'absent', 'mock', 'pending_review', 'June mock: no show'),
    (1, '2026-06-17', '09:00', '20:00', 660, 0, 0, 120, 'present', 'mock', 'not_applicable', 'June mock: project overtime'),
    (1, '2026-06-18', '09:00', '17:30', 510, 0, 30, 0, 'present', 'mock', 'not_applicable', 'June mock: early leave minutes'),
    (1, '2026-06-22', '09:45', '18:00', 495, 45, 0, 0, 'late', 'mock', 'pending_review', 'June mock: late arrival'),
    (1, '2026-06-25', '09:00', NULL, NULL, 0, 0, 0, 'missing_checkout', 'mock', 'pending_review', 'June mock: missing checkout'),
    (1, '2026-06-26', '09:00', '19:00', 600, 0, 0, 60, 'present', 'mock', 'not_applicable', 'June mock: overtime'),
    (1, '2026-06-30', '09:10', '18:00', 530, 10, 0, 0, 'late', 'mock', 'pending_review', 'June mock: minor late'),

    -- Employee 2: part-time-style variation with absences, leave, and overtime
    (2, '2026-06-01', '09:10', '18:00', 530, 10, 0, 0, 'late', 'mock', 'pending_review', 'June mock: minor late'),
    (2, '2026-06-04', '09:00', '17:00', 480, 0, 60, 0, 'present', 'mock', 'not_applicable', 'June mock: early leave minutes'),
    (2, '2026-06-08', '09:00', NULL, NULL, 0, 0, 0, 'missing_checkout', 'mock', 'pending_review', 'June mock: missing checkout'),
    (2, '2026-06-11', NULL, NULL, NULL, 0, 0, 0, 'absent', 'mock', 'pending_review', 'June mock: absent'),
    (2, '2026-06-15', '09:00', '18:30', 570, 0, 0, 30, 'present', 'mock', 'not_applicable', 'June mock: overtime'),
    (2, '2026-06-19', NULL, NULL, NULL, 0, 0, 0, 'on_leave', 'mock', 'not_applicable', 'June mock: medical leave'),
    (2, '2026-06-23', '09:30', '18:00', 510, 30, 0, 0, 'late', 'mock', 'pending_review', 'June mock: late arrival'),
    (2, '2026-06-24', NULL, NULL, NULL, 0, 0, 0, 'on_leave', 'mock', 'not_applicable', 'June mock: annual leave'),
    (2, '2026-06-25', NULL, NULL, NULL, 0, 0, 0, 'on_leave', 'mock', 'not_applicable', 'June mock: annual leave'),
    (2, '2026-06-29', NULL, NULL, NULL, 0, 0, 0, 'absent', 'mock', 'pending_review', 'June mock: absent'),
    (2, '2026-06-30', '09:00', '20:00', 660, 0, 0, 120, 'present', 'mock', 'not_applicable', 'June mock: month-end overtime'),

    -- Employee 3: freelancer-style variation with repeated review cases
    (3, '2026-06-02', '09:20', '18:00', 520, 20, 0, 0, 'late', 'mock', 'pending_review', 'June mock: late arrival'),
    (3, '2026-06-03', NULL, NULL, NULL, 0, 0, 0, 'absent', 'mock', 'pending_review', 'June mock: absent'),
    (3, '2026-06-09', '09:00', '19:00', 600, 0, 0, 60, 'present', 'mock', 'not_applicable', 'June mock: overtime'),
    (3, '2026-06-12', '09:00', NULL, NULL, 0, 0, 0, 'missing_checkout', 'mock', 'pending_review', 'June mock: missing checkout'),
    (3, '2026-06-16', '09:45', '18:00', 495, 45, 0, 0, 'late', 'mock', 'pending_review', 'June mock: late arrival'),
    (3, '2026-06-18', NULL, NULL, NULL, 0, 0, 0, 'on_leave', 'mock', 'not_applicable', 'June mock: personal leave'),
    (3, '2026-06-22', '09:00', '19:30', 630, 0, 0, 90, 'present', 'mock', 'not_applicable', 'June mock: overtime'),
    (3, '2026-06-24', '09:15', '18:30', 555, 15, 0, 30, 'late', 'mock', 'pending_review', 'June mock: late with overtime'),
    (3, '2026-06-26', NULL, NULL, NULL, 0, 0, 0, 'absent', 'mock', 'pending_review', 'June mock: absent'),
    (3, '2026-06-30', '09:00', NULL, NULL, 0, 0, 0, 'missing_checkout', 'mock', 'pending_review', 'June mock: missing checkout')
)
INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT
  'ar-e' || je.slot || '-' || replace(je.work_date, '-', ''),
  es.person_id,
  je.work_date,
  je.check_in_time,
  je.check_out_time,
  je.worked_minutes,
  je.late_minutes,
  je.early_leave_minutes,
  je.overtime_minutes,
  je.status,
  je.source,
  je.payroll_effect,
  je.notes,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  NULL
FROM june_exceptions je
JOIN employee_slots es ON es.slot = je.slot;

WITH RECURSIVE dates(work_date) AS (
  VALUES('2026-06-01')
  UNION ALL
  SELECT date(work_date, '+1 day')
  FROM dates
  WHERE work_date < '2026-06-30'
),
employee_slots(slot, person_id) AS (
  SELECT 1 AS slot, person_id FROM (
    SELECT ep.person_id
    FROM employee_profiles ep
    WHERE ep.status = 'active' AND ep.deleted_at IS NULL
    ORDER BY ep.created_at, ep.id
    LIMIT 1 OFFSET 0
  )
  UNION ALL
  SELECT 2 AS slot, person_id FROM (
    SELECT ep.person_id
    FROM employee_profiles ep
    WHERE ep.status = 'active' AND ep.deleted_at IS NULL
    ORDER BY ep.created_at, ep.id
    LIMIT 1 OFFSET 1
  )
  UNION ALL
  SELECT 3 AS slot, person_id FROM (
    SELECT ep.person_id
    FROM employee_profiles ep
    WHERE ep.status = 'active' AND ep.deleted_at IS NULL
    ORDER BY ep.created_at, ep.id
    LIMIT 1 OFFSET 2
  )
)
INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT
  'ar-e' || es.slot || '-' || replace(d.work_date, '-', ''),
  es.person_id,
  d.work_date,
  NULL,
  NULL,
  NULL,
  0,
  0,
  0,
  'rest_day',
  'mock',
  'not_applicable',
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  NULL
FROM dates d
CROSS JOIN employee_slots es
WHERE strftime('%w', d.work_date) IN ('0', '6');

WITH RECURSIVE dates(work_date) AS (
  VALUES('2026-06-01')
  UNION ALL
  SELECT date(work_date, '+1 day')
  FROM dates
  WHERE work_date < '2026-06-30'
),
employee_slots(slot, person_id) AS (
  SELECT 1 AS slot, person_id FROM (
    SELECT ep.person_id
    FROM employee_profiles ep
    WHERE ep.status = 'active' AND ep.deleted_at IS NULL
    ORDER BY ep.created_at, ep.id
    LIMIT 1 OFFSET 0
  )
  UNION ALL
  SELECT 2 AS slot, person_id FROM (
    SELECT ep.person_id
    FROM employee_profiles ep
    WHERE ep.status = 'active' AND ep.deleted_at IS NULL
    ORDER BY ep.created_at, ep.id
    LIMIT 1 OFFSET 1
  )
  UNION ALL
  SELECT 3 AS slot, person_id FROM (
    SELECT ep.person_id
    FROM employee_profiles ep
    WHERE ep.status = 'active' AND ep.deleted_at IS NULL
    ORDER BY ep.created_at, ep.id
    LIMIT 1 OFFSET 2
  )
)
INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT
  'ar-e' || es.slot || '-' || replace(d.work_date, '-', ''),
  es.person_id,
  d.work_date,
  '09:00',
  '18:00',
  540,
  0,
  0,
  0,
  'present',
  'mock',
  'not_applicable',
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  NULL
FROM dates d
CROSS JOIN employee_slots es
WHERE strftime('%w', d.work_date) NOT IN ('0', '6');

-- ---------------------------------------------------------------------------
-- JULY 2026 FULL-MONTH MOCK DATA
-- Covers 2026-07-01 (Wed) to 2026-07-31 (Fri).
-- Uses the first three active employee_profiles. If an environment has fewer
-- active employees, the missing slots naturally no-op.
-- New ids use the ar-mock-2026-07-* prefix so these rows are easy to identify.
-- Insert exceptions first, then fill all remaining weekdays/weekends with
-- default present/rest_day rows via INSERT OR IGNORE.
-- ---------------------------------------------------------------------------

WITH employee_slots(slot, person_id) AS (
  SELECT 1 AS slot, person_id FROM (
    SELECT ep.person_id
    FROM employee_profiles ep
    WHERE ep.status = 'active' AND ep.deleted_at IS NULL
    ORDER BY ep.created_at, ep.id
    LIMIT 1 OFFSET 0
  )
  UNION ALL
  SELECT 2 AS slot, person_id FROM (
    SELECT ep.person_id
    FROM employee_profiles ep
    WHERE ep.status = 'active' AND ep.deleted_at IS NULL
    ORDER BY ep.created_at, ep.id
    LIMIT 1 OFFSET 1
  )
  UNION ALL
  SELECT 3 AS slot, person_id FROM (
    SELECT ep.person_id
    FROM employee_profiles ep
    WHERE ep.status = 'active' AND ep.deleted_at IS NULL
    ORDER BY ep.created_at, ep.id
    LIMIT 1 OFFSET 2
  )
),
july_exceptions(
  slot, work_date, check_in_time, check_out_time, worked_minutes,
  late_minutes, early_leave_minutes, overtime_minutes,
  status, source, payroll_effect, notes
) AS (
  VALUES
    -- Employee 1: review cases, leave, and several overtime candidates
    (1, '2026-07-02', '09:25', '18:00', 515, 25, 0, 0, 'late', 'mock', 'pending_review', 'July mock: late arrival'),
    (1, '2026-07-06', '09:00', '20:00', 660, 0, 0, 120, 'present', 'mock', 'not_applicable', 'July mock: release overtime'),
    (1, '2026-07-08', '09:00', NULL, NULL, 0, 0, 0, 'missing_checkout', 'mock', 'pending_review', 'July mock: missing checkout'),
    (1, '2026-07-10', NULL, NULL, NULL, 0, 0, 0, 'on_leave', 'mock', 'not_applicable', 'July mock: annual leave'),
    (1, '2026-07-14', NULL, NULL, NULL, 0, 0, 0, 'absent', 'mock', 'pending_review', 'July mock: no show'),
    (1, '2026-07-16', '09:15', '19:00', 585, 15, 0, 60, 'late', 'mock', 'pending_review', 'July mock: late with overtime'),
    (1, '2026-07-22', '09:00', '18:30', 570, 0, 0, 30, 'present', 'mock', 'not_applicable', 'July mock: short overtime'),
    (1, '2026-07-27', '09:00', '19:30', 630, 0, 0, 90, 'present', 'mock', 'not_applicable', 'July mock: inventory close overtime'),
    (1, '2026-07-31', '09:35', '18:00', 505, 35, 0, 0, 'late', 'mock', 'pending_review', 'July mock: late arrival'),

    -- Employee 2: month-end and mid-month overtime plus HR review cases
    (2, '2026-07-01', '09:00', '19:00', 600, 0, 0, 60, 'present', 'mock', 'not_applicable', 'July mock: month-start overtime'),
    (2, '2026-07-03', '09:00', NULL, NULL, 0, 0, 0, 'missing_checkout', 'mock', 'pending_review', 'July mock: missing checkout'),
    (2, '2026-07-07', '09:10', '18:00', 530, 10, 0, 0, 'late', 'mock', 'pending_review', 'July mock: minor late'),
    (2, '2026-07-09', NULL, NULL, NULL, 0, 0, 0, 'absent', 'mock', 'pending_review', 'July mock: absent'),
    (2, '2026-07-13', NULL, NULL, NULL, 0, 0, 0, 'on_leave', 'mock', 'not_applicable', 'July mock: medical leave'),
    (2, '2026-07-17', '09:00', '20:30', 690, 0, 0, 150, 'present', 'mock', 'not_applicable', 'July mock: export support overtime'),
    (2, '2026-07-20', '09:20', '19:00', 580, 20, 0, 60, 'late', 'mock', 'pending_review', 'July mock: late with overtime'),
    (2, '2026-07-23', '09:00', NULL, NULL, 0, 0, 0, 'missing_checkout', 'mock', 'pending_review', 'July mock: missing checkout'),
    (2, '2026-07-24', NULL, NULL, NULL, 0, 0, 0, 'absent', 'mock', 'pending_review', 'July mock: absent'),
    (2, '2026-07-29', '09:00', '18:45', 585, 0, 0, 45, 'present', 'mock', 'not_applicable', 'July mock: short overtime'),

    -- Employee 3: only inserts when a third active employee exists
    (3, '2026-07-01', '09:30', '18:00', 510, 30, 0, 0, 'late', 'mock', 'pending_review', 'July mock: late arrival'),
    (3, '2026-07-02', NULL, NULL, NULL, 0, 0, 0, 'absent', 'mock', 'pending_review', 'July mock: absent'),
    (3, '2026-07-06', '09:00', '19:30', 630, 0, 0, 90, 'present', 'mock', 'not_applicable', 'July mock: client support overtime'),
    (3, '2026-07-08', NULL, NULL, NULL, 0, 0, 0, 'on_leave', 'mock', 'not_applicable', 'July mock: personal leave'),
    (3, '2026-07-15', '09:00', NULL, NULL, 0, 0, 0, 'missing_checkout', 'mock', 'pending_review', 'July mock: missing checkout'),
    (3, '2026-07-17', '09:45', '19:15', 570, 45, 0, 75, 'late', 'mock', 'pending_review', 'July mock: late with overtime'),
    (3, '2026-07-21', '09:00', '20:00', 660, 0, 0, 120, 'present', 'mock', 'not_applicable', 'July mock: finance close overtime'),
    (3, '2026-07-24', '09:15', '18:00', 525, 15, 0, 0, 'late', 'mock', 'pending_review', 'July mock: late arrival'),
    (3, '2026-07-28', NULL, NULL, NULL, 0, 0, 0, 'on_leave', 'mock', 'not_applicable', 'July mock: annual leave'),
    (3, '2026-07-30', '09:00', '18:30', 570, 0, 0, 30, 'present', 'mock', 'not_applicable', 'July mock: short overtime')
)
INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT
  'ar-mock-2026-07-e' || je.slot || '-' || replace(je.work_date, '-', ''),
  es.person_id,
  je.work_date,
  je.check_in_time,
  je.check_out_time,
  je.worked_minutes,
  je.late_minutes,
  je.early_leave_minutes,
  je.overtime_minutes,
  je.status,
  je.source,
  je.payroll_effect,
  je.notes,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  NULL
FROM july_exceptions je
JOIN employee_slots es ON es.slot = je.slot;

WITH RECURSIVE dates(work_date) AS (
  VALUES('2026-07-01')
  UNION ALL
  SELECT date(work_date, '+1 day')
  FROM dates
  WHERE work_date < '2026-07-31'
),
employee_slots(slot, person_id) AS (
  SELECT 1 AS slot, person_id FROM (
    SELECT ep.person_id
    FROM employee_profiles ep
    WHERE ep.status = 'active' AND ep.deleted_at IS NULL
    ORDER BY ep.created_at, ep.id
    LIMIT 1 OFFSET 0
  )
  UNION ALL
  SELECT 2 AS slot, person_id FROM (
    SELECT ep.person_id
    FROM employee_profiles ep
    WHERE ep.status = 'active' AND ep.deleted_at IS NULL
    ORDER BY ep.created_at, ep.id
    LIMIT 1 OFFSET 1
  )
  UNION ALL
  SELECT 3 AS slot, person_id FROM (
    SELECT ep.person_id
    FROM employee_profiles ep
    WHERE ep.status = 'active' AND ep.deleted_at IS NULL
    ORDER BY ep.created_at, ep.id
    LIMIT 1 OFFSET 2
  )
)
INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT
  'ar-mock-2026-07-e' || es.slot || '-' || replace(d.work_date, '-', ''),
  es.person_id,
  d.work_date,
  NULL,
  NULL,
  NULL,
  0,
  0,
  0,
  'rest_day',
  'mock',
  'not_applicable',
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  NULL
FROM dates d
CROSS JOIN employee_slots es
WHERE strftime('%w', d.work_date) IN ('0', '6');

WITH RECURSIVE dates(work_date) AS (
  VALUES('2026-07-01')
  UNION ALL
  SELECT date(work_date, '+1 day')
  FROM dates
  WHERE work_date < '2026-07-31'
),
employee_slots(slot, person_id) AS (
  SELECT 1 AS slot, person_id FROM (
    SELECT ep.person_id
    FROM employee_profiles ep
    WHERE ep.status = 'active' AND ep.deleted_at IS NULL
    ORDER BY ep.created_at, ep.id
    LIMIT 1 OFFSET 0
  )
  UNION ALL
  SELECT 2 AS slot, person_id FROM (
    SELECT ep.person_id
    FROM employee_profiles ep
    WHERE ep.status = 'active' AND ep.deleted_at IS NULL
    ORDER BY ep.created_at, ep.id
    LIMIT 1 OFFSET 1
  )
  UNION ALL
  SELECT 3 AS slot, person_id FROM (
    SELECT ep.person_id
    FROM employee_profiles ep
    WHERE ep.status = 'active' AND ep.deleted_at IS NULL
    ORDER BY ep.created_at, ep.id
    LIMIT 1 OFFSET 2
  )
)
INSERT OR IGNORE INTO attendance_records
  (id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
   late_minutes, early_leave_minutes, overtime_minutes,
   status, source, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT
  'ar-mock-2026-07-e' || es.slot || '-' || replace(d.work_date, '-', ''),
  es.person_id,
  d.work_date,
  '09:00',
  '18:00',
  540,
  0,
  0,
  0,
  'present',
  'mock',
  'not_applicable',
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  NULL
FROM dates d
CROSS JOIN employee_slots es
WHERE strftime('%w', d.work_date) NOT IN ('0', '6');
