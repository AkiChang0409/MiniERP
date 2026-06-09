-- Overtime Management seed data
-- Generates mock overtime requests from attendance_records where overtime_minutes > 0.
-- Covers selected candidates in 2026-06-01 to 2026-07-31.
-- Uses INSERT OR IGNORE and checks existing attendance_record_id requests for idempotency.
--
-- Payroll rule:
--   pending  -> payroll_effect = not_applicable
--   approved -> payroll_effect = pending_export
--   rejected -> payroll_effect = not_applicable
--
-- Payroll must consume approved overtime_requests only, not attendance_records.overtime_minutes.

WITH request_plan(
  request_id,
  approval_id,
  attendance_record_id,
  target_status,
  reason,
  action_comment,
  action_at
) AS (
  VALUES
    -- June 2026: use existing June attendance mock ids from attendance-seed.sql.
    ('or-mock-2026-06-e1-20260612', NULL, 'ar-e1-20260612', 'pending', 'Late support for month-end reconciliation', NULL, NULL),
    ('or-mock-2026-06-e1-20260626', 'oar-mock-2026-06-e1-20260626', 'ar-e1-20260626', 'approved', 'Customer shipment deadline support', 'Approved for payroll export.', '2026-06-27T09:00:00Z'),
    ('or-mock-2026-06-e2-20260630', 'oar-mock-2026-06-e2-20260630', 'ar-e2-20260630', 'rejected', 'Month-end overtime claim', 'Rejected: overtime was not pre-approved.', '2026-07-01T10:30:00Z'),
    ('or-mock-2026-06-e3-20260622', 'oar-mock-2026-06-e3-20260622', 'ar-e3-20260622', 'approved', 'Inventory variance investigation', 'Approved after manager confirmation.', '2026-06-23T09:30:00Z'),
    ('or-mock-2026-06-e3-20260624', NULL, 'ar-e3-20260624', 'pending', 'Late arrival but stayed for production support', NULL, NULL),

    -- July 2026: use the ar-mock-2026-07-* ids added by this seed set.
    ('or-mock-2026-07-e1-20260706', 'oar-mock-2026-07-e1-20260706', 'ar-mock-2026-07-e1-20260706', 'approved', 'Release cutover support', 'Approved for release cutover.', '2026-07-07T09:00:00Z'),
    ('or-mock-2026-07-e1-20260716', 'oar-mock-2026-07-e1-20260716', 'ar-mock-2026-07-e1-20260716', 'rejected', 'Late arrival with extra time', 'Rejected: late arrival offset the extra time.', '2026-07-17T10:00:00Z'),
    ('or-mock-2026-07-e1-20260722', NULL, 'ar-mock-2026-07-e1-20260722', 'pending', 'Short evening support window', NULL, NULL),
    ('or-mock-2026-07-e2-20260701', NULL, 'ar-mock-2026-07-e2-20260701', 'pending', 'Month-start finance support', NULL, NULL),
    ('or-mock-2026-07-e2-20260717', 'oar-mock-2026-07-e2-20260717', 'ar-mock-2026-07-e2-20260717', 'approved', 'Export documentation deadline', 'Approved by HR after manager note.', '2026-07-20T09:15:00Z'),
    ('or-mock-2026-07-e2-20260720', 'oar-mock-2026-07-e2-20260720', 'ar-mock-2026-07-e2-20260720', 'rejected', 'Late with overtime claim', 'Rejected: insufficient justification.', '2026-07-21T11:00:00Z'),
    ('or-mock-2026-07-e3-20260706', NULL, 'ar-mock-2026-07-e3-20260706', 'pending', 'Client support overtime', NULL, NULL),
    ('or-mock-2026-07-e3-20260717', 'oar-mock-2026-07-e3-20260717', 'ar-mock-2026-07-e3-20260717', 'rejected', 'Late arrival with overtime', 'Rejected: overtime not approved by project lead.', '2026-07-20T10:45:00Z'),
    ('or-mock-2026-07-e3-20260721', 'oar-mock-2026-07-e3-20260721', 'ar-mock-2026-07-e3-20260721', 'approved', 'Finance close overtime', 'Approved for payroll export.', '2026-07-22T09:00:00Z')
)
INSERT OR IGNORE INTO overtime_requests
  (id, person_id, attendance_record_id, work_date, overtime_minutes, reason,
   status, source, approved_by_user_id, approved_at, rejected_by_user_id,
   rejected_at, rejection_reason, payroll_effect, notes, created_at, updated_at, deleted_at)
SELECT
  rp.request_id,
  ar.person_id,
  ar.id,
  ar.work_date,
  ar.overtime_minutes,
  rp.reason,
  rp.target_status,
  'attendance_detected',
  CASE WHEN rp.target_status = 'approved' THEN 'user-hr-demo' ELSE NULL END,
  CASE WHEN rp.target_status = 'approved' THEN rp.action_at ELSE NULL END,
  CASE WHEN rp.target_status = 'rejected' THEN 'user-hr-demo' ELSE NULL END,
  CASE WHEN rp.target_status = 'rejected' THEN rp.action_at ELSE NULL END,
  CASE WHEN rp.target_status = 'rejected' THEN rp.action_comment ELSE NULL END,
  CASE WHEN rp.target_status = 'approved' THEN 'pending_export' ELSE 'not_applicable' END,
  'Mock overtime request generated from attendance seed.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  NULL
FROM request_plan rp
JOIN attendance_records ar
  ON ar.id = rp.attendance_record_id
LEFT JOIN overtime_requests existing
  ON existing.attendance_record_id = ar.id
 AND existing.deleted_at IS NULL
WHERE ar.deleted_at IS NULL
  AND ar.overtime_minutes > 0
  AND existing.id IS NULL;

WITH request_plan(
  request_id,
  approval_id,
  attendance_record_id,
  target_status,
  reason,
  action_comment,
  action_at
) AS (
  VALUES
    ('or-mock-2026-06-e1-20260612', NULL, 'ar-e1-20260612', 'pending', 'Late support for month-end reconciliation', NULL, NULL),
    ('or-mock-2026-06-e1-20260626', 'oar-mock-2026-06-e1-20260626', 'ar-e1-20260626', 'approved', 'Customer shipment deadline support', 'Approved for payroll export.', '2026-06-27T09:00:00Z'),
    ('or-mock-2026-06-e2-20260630', 'oar-mock-2026-06-e2-20260630', 'ar-e2-20260630', 'rejected', 'Month-end overtime claim', 'Rejected: overtime was not pre-approved.', '2026-07-01T10:30:00Z'),
    ('or-mock-2026-06-e3-20260622', 'oar-mock-2026-06-e3-20260622', 'ar-e3-20260622', 'approved', 'Inventory variance investigation', 'Approved after manager confirmation.', '2026-06-23T09:30:00Z'),
    ('or-mock-2026-06-e3-20260624', NULL, 'ar-e3-20260624', 'pending', 'Late arrival but stayed for production support', NULL, NULL),
    ('or-mock-2026-07-e1-20260706', 'oar-mock-2026-07-e1-20260706', 'ar-mock-2026-07-e1-20260706', 'approved', 'Release cutover support', 'Approved for release cutover.', '2026-07-07T09:00:00Z'),
    ('or-mock-2026-07-e1-20260716', 'oar-mock-2026-07-e1-20260716', 'ar-mock-2026-07-e1-20260716', 'rejected', 'Late arrival with extra time', 'Rejected: late arrival offset the extra time.', '2026-07-17T10:00:00Z'),
    ('or-mock-2026-07-e1-20260722', NULL, 'ar-mock-2026-07-e1-20260722', 'pending', 'Short evening support window', NULL, NULL),
    ('or-mock-2026-07-e2-20260701', NULL, 'ar-mock-2026-07-e2-20260701', 'pending', 'Month-start finance support', NULL, NULL),
    ('or-mock-2026-07-e2-20260717', 'oar-mock-2026-07-e2-20260717', 'ar-mock-2026-07-e2-20260717', 'approved', 'Export documentation deadline', 'Approved by HR after manager note.', '2026-07-20T09:15:00Z'),
    ('or-mock-2026-07-e2-20260720', 'oar-mock-2026-07-e2-20260720', 'ar-mock-2026-07-e2-20260720', 'rejected', 'Late with overtime claim', 'Rejected: insufficient justification.', '2026-07-21T11:00:00Z'),
    ('or-mock-2026-07-e3-20260706', NULL, 'ar-mock-2026-07-e3-20260706', 'pending', 'Client support overtime', NULL, NULL),
    ('or-mock-2026-07-e3-20260717', 'oar-mock-2026-07-e3-20260717', 'ar-mock-2026-07-e3-20260717', 'rejected', 'Late arrival with overtime', 'Rejected: overtime not approved by project lead.', '2026-07-20T10:45:00Z'),
    ('or-mock-2026-07-e3-20260721', 'oar-mock-2026-07-e3-20260721', 'ar-mock-2026-07-e3-20260721', 'approved', 'Finance close overtime', 'Approved for payroll export.', '2026-07-22T09:00:00Z')
)
INSERT OR IGNORE INTO overtime_approval_records
  (id, overtime_request_id, action, actor_id, actor_name, from_status, to_status,
   comment, created_at, updated_at, deleted_at)
SELECT
  rp.approval_id,
  req.id,
  rp.target_status,
  'user-hr-demo',
  'hr@smartfin.local',
  'pending',
  rp.target_status,
  rp.action_comment,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  NULL
FROM request_plan rp
JOIN overtime_requests req
  ON req.id = rp.request_id
WHERE rp.target_status IN ('approved', 'rejected')
  AND rp.approval_id IS NOT NULL;
