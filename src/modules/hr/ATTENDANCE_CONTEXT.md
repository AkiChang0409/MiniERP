# Attendance Management — Implementation Context

## Purpose

Provides HR/Admin with a read-only view of employee attendance:
- **Weekly Summary**: employee-level weekly statistics
- **Daily Detail**: individual records for a specific employee × week

MVP scope is enterprise admin only. Employee-facing punch-in/out is out of scope.

---

## Architecture

Follows the same layering as Leave Management:

```
SvelteKit route (+page.server.ts)
  → createAttendanceApi   (src/modules/hr/attendance-api.ts)
    → AttendanceService   (src/modules/hr/services/attendance-service.ts)
      → AttendanceRepository (src/modules/hr/repositories/attendance-repository.ts)
        → Drizzle / D1
```

Routes import only from `$modules/hr` barrel. Internal paths are never imported by routes.

---

## Data Model: `attendance_records`

One row = one person × one work date. Unique constraint on `(person_id, work_date)`.

### Status Enum (MVP — 6 values)

| Status | Meaning |
|--------|---------|
| `present` | Normal attendance (09:00–18:00) |
| `late` | Check-in after 09:00 |
| `absent` | No check-in, no leave approved |
| `on_leave` | Covered by approved leave |
| `missing_checkout` | Check-in present, check-out missing |
| `rest_day` | Weekend or company holiday |

`half_day` is reserved for future extension and **not** in the MVP enum.

### Source Enum

`mock` / `manual` / `employee_portal` / `mobile` / `terminal` / `imported`

---

## worked_minutes

`worked_minutes` stores the **gross duration** from `check_in_time` to `check_out_time` in minutes.

- Standard full day: `09:00 → 18:00` = **540 minutes**
- Late arrival: `09:30 → 18:00` = **510 minutes**
- Overtime: `09:00 → 20:00` = **660 minutes**

**This is NOT payroll-grade net worked time.** Lunch/break time is not deducted.
Future extension: add `break_minutes`, `paid_work_minutes`, `work_schedule_id` when Payroll needs accuracy.

Nullable for `absent`, `on_leave`, `missing_checkout`, `rest_day` records.

---

## overtime_minutes

`overtime_minutes` is for display and statistics in MVP only.

**Overtime payroll input must NOT come directly from this field.**
In the future, overtime that affects pay should go through an Overtime Management approval flow,
which produces its own payroll-ready records.

---

## payrollEffect Rules

Defined exclusively in `AttendanceService.resolvePayrollEffect()`. Never set in Svelte.

| Status | payroll_effect |
|--------|----------------|
| `present` | `not_applicable` |
| `on_leave` | `not_applicable` |
| `rest_day` | `not_applicable` |
| `late` | `pending_review` |
| `absent` | `pending_review` |
| `missing_checkout` | `pending_review` |

Payroll lifecycle (future):
1. `pending_review` — HR needs to review and decide
2. `pending_export` — HR confirmed, ready for payroll export
3. `exported` — Payroll module has consumed the record

**Payroll module must NOT modify attendance core fields** (status, check_in/out times, worked_minutes).
It should only update `payroll_effect` to reflect its lifecycle stage.

---

## status/source Filter Semantics

Filters are applied at the DB query level before JS aggregation.

The weekly summary therefore reflects only records matching those filters ("filtered weekly summary").
This is the intended MVP behaviour: the user is asking "show me weeks/employees with late records"
rather than "show me full week stats but highlight late records".

---

## Weekly Summary Aggregation

Weekly summary is NOT stored. It is computed in `AttendanceService.listWeeklyAttendanceSummary()`:

1. Query `attendance_records` within the date range (with optional status/source filters)
2. Group by `(personId, isoWeekStart)` in JavaScript
3. Count statuses and sum `workedMinutes` / `overtimeMinutes`
4. Return `WeeklyAttendanceSummary[]` sorted by `weekStart DESC, employeeName ASC`

`isoWeekStart` is computed by `getIsoWeekStart(dateStr)` — week starts on Monday.

---

## Detail View URL

```
/hr/attendance?view=detail&personId=<id>&weekStart=2026-05-04&weekEnd=2026-05-10
```

Both `personId` and `weekStart` are required. The load function fetches:
1. `attendance.listRecords({ personId, weekStart, weekEnd })`
2. `attendance.getPersonName(personId)` — ensures employee name shows even when records is empty

---

## Leave → Attendance Sync

`on_leave` attendance records are generated automatically by `LeaveService` when
a leave request is approved. You do **not** insert them manually.

### How it works

1. `LeaveService.approveLeaveRequest()` commits the D1 batch (status + balance + audit log).
2. It then calls `syncLeaveToAttendance()` which iterates every calendar date in
   `[startDate, endDate]` and upserts an `attendance_records` row:

```
status = on_leave
source = leave_sync
payroll_effect = not_applicable
check_in/out = null, worked_minutes = null
notes = "leave_sync:<leaveRequestId>"
```

3. Existing records with `source ∈ {mock, manual, leave_sync}` are overwritten.
   Records from real punch sources (`mobile`, `terminal`, `employee_portal`) are
   left untouched (TODO: conflict flag).

### Source enum

`leave_sync` is a valid `source` value in the schema. No migration was needed —
SQLite does not generate a CHECK constraint for Drizzle text enum fields.

### Payroll non-duplication rule

Even if the approved leave is **Unpaid Leave** (`affectsPayroll = true`):
- `attendance_records.payroll_effect` = `not_applicable`
- `leave_requests.payroll_effect` = `pending_export`

Payroll must consume Unpaid Leave through `leave_requests`, **not** through
`attendance_records.on_leave` rows. Consuming both would double-count the deduction.

### Backfill

```typescript
const count = await leave.syncBackfill(dateFrom, dateTo);
```

Syncs all `approved` leave requests overlapping `[dateFrom, dateTo]`. Idempotent —
safe to re-run. Returns the number of leave requests processed.

---

## Payroll Integration Hook

```typescript
attendance.getPayrollInputs(periodStart, periodEnd)
// Returns records where payroll_effect IN ('pending_review', 'pending_export')
//   AND work_date BETWEEN periodStart AND periodEnd
```

Use this as the entry point for Payroll module integration. Do not query `attendance_records` directly from outside the HR module.
