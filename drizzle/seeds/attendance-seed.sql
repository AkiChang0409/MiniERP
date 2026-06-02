-- Attendance Management seed data
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
