# Overtime Management — Implementation Context

> Authoritative implementation reference for HR Overtime Management.
> Read it before touching any overtime-related file. Read
> `ATTENDANCE_CONTEXT.md` and `LEAVE_MANAGEMENT_CONTEXT.md` first — Overtime
> builds directly on Attendance and mirrors Leave's approval flow.

---

## Scope (what is and is not here)

**In scope — admin-side Overtime Management (MVP)**

- Generate overtime requests from attendance records with `overtime_minutes > 0`.
- HR/Admin approve / reject those requests.
- Audit trail: every approve/reject writes an `overtime_approval_records` row.
- Payroll hook: approved overtime is marked `payroll_effect = pending_export`
  and exposed via `getOvertimePayrollInputs(periodStart, periodEnd)`.

**Explicitly out of scope**

- Employee self-service overtime application.
- Overtime pay calculation / pay amount.
- Payroll run / payslip / CPF.
- Multi-level approval chains.
- Remote migrations or production Cloudflare config changes.

---

## Core Design Principle

`attendance_records.overtime_minutes` is only an **attendance fact** — the system
detected possible overtime. It is **not** company-approved, payable overtime.

Overtime Management is the approval layer:

```
attendance_records.overtime_minutes > 0
        ↓  overtime candidate
   generate overtime request          (status=pending, payroll_effect=not_applicable)
        ↓
   HR/Admin approve / reject
        ↓
   approved overtime → payroll_effect = pending_export
```

**Payroll must read only approved overtime requests, never
`attendance_records.overtime_minutes` directly.** This is the same
non-duplication discipline Leave uses (`leave_requests.payroll_effect`).

---

## Key File Map

| Layer | File |
|-------|------|
| Schema | `src/modules/hr/repositories/overtime.schema.ts` |
| Repositories | `src/modules/hr/repositories/overtime-repository.ts` |
| Service | `src/modules/hr/services/overtime-service.ts` |
| Public API factory | `src/modules/hr/overtime-api.ts` |
| Route (load + actions) | `src/routes/(app)/hr/overtime/+page.server.ts` |
| UI | `src/routes/(app)/hr/overtime/+page.svelte` |
| Migration | `drizzle/migrations/0010_hr_overtime_management.sql` |
| Unit tests | `src/test/unit/overtime-service.test.ts` |
| Integration tests | `src/test/integration/overtime-service.integration.test.ts` |

The public boundary is `src/modules/hr/index.ts`. Routes import `createOvertimeApi`
and `OvertimeValidationError` from `$modules/hr`, never from internal paths. The
boundary linter (`npm run check:modular-boundary`) enforces this.

---

## Data Model (2 tables)

### `overtime_requests`

One row per overtime request.

| Column | Notes |
|--------|-------|
| `person_id` | FK → `persons.id` (snapshot from the attendance record) |
| `attendance_record_id` | FK → `attendance_records.id` — **UNIQUE** (one request per record) |
| `work_date` | snapshot of `attendance_records.work_date` |
| `overtime_minutes` | snapshot of `attendance_records.overtime_minutes` at generation time |
| `status` | `pending` → `approved` / `rejected` / `cancelled` |
| `source` | `attendance_detected` / `manual` / `employee_portal` / `imported` |
| `payroll_effect` | `not_applicable` / `pending_export` / `exported` |
| `approved_by_user_id` / `approved_at` | snapshot on approve |
| `rejected_by_user_id` / `rejected_at` / `rejection_reason` | snapshot on reject |

The `UNIQUE(attendance_record_id)` index (`overtime_attendance_record_uniq`) is the
hard guard against generating two requests from the same attendance record. The
service also checks explicitly to return a friendly error before hitting the
constraint.

### `overtime_approval_records`

Immutable audit log — one row per approve/reject action (mirrors
`leave_approval_records`).

| Column | Notes |
|--------|-------|
| `overtime_request_id` | FK → `overtime_requests.id` |
| `action` | `approved` / `rejected` / `cancelled` |
| `actor_id` | snapshot of `ctx.user.id` |
| `actor_name` | snapshot of `ctx.user.email` |
| `from_status` / `to_status` | state transition |
| `comment` | approval comment or rejection reason |

---

## Service Flow

All logic lives in `OvertimeService`. Routes never touch the DB.

### `listOvertimeCandidates({ dateFrom?, dateTo?, personId? })`

`attendance_records` LEFT JOIN `overtime_requests` (on `attendance_record_id`,
non-deleted) WHERE `overtime_minutes > 0` AND the join side `id IS NULL`. The
NULL join row is what makes it a *candidate* — i.e. no request exists yet.

### `generateOvertimeRequest(attendanceRecordId, reason?)`

1. Load the attendance record — throw `'Attendance record not found'` if missing.
2. Assert `overtime_minutes > 0` — else `'Attendance record has no overtime to request'`.
3. `findByAttendanceRecordId` — else `'An overtime request already exists for this attendance record'`.
4. INSERT request: `status='pending'`, `source='attendance_detected'`,
   `payroll_effect='not_applicable'`, snapshotting `personId / workDate / overtimeMinutes`.

Returns the new request id.

### `approveOvertimeRequest(id, comment?)` / `rejectOvertimeRequest(id, reason)`

Validate `status === 'pending'` (else `'Only pending requests can be {approved,rejected}'`),
then a single `db.batch([...])`:

- **approve** → `UPDATE overtime_requests SET status='approved', approved_by_user_id, approved_at, payroll_effect='pending_export'` + `INSERT overtime_approval_records (action='approved')`.
- **reject** → `UPDATE overtime_requests SET status='rejected', rejected_by_user_id, rejected_at, rejection_reason, payroll_effect='not_applicable'` + `INSERT overtime_approval_records (action='rejected')`.

The `db.batch` cast pattern and atomicity guarantee are identical to Leave — see
`LEAVE_MANAGEMENT_CONTEXT.md` § "db.batch Atomicity". Do not split the two writes
into sequential awaits.

---

## Payroll Integration Hook

```typescript
overtime.getPayrollInputs(periodStart, periodEnd)
// SELECT * FROM overtime_requests
//   WHERE status = 'approved'
//     AND payroll_effect = 'pending_export'
//     AND work_date BETWEEN periodStart AND periodEnd
//     AND deleted_at IS NULL
```

This is the **only** sanctioned source of payable overtime. After exporting,
Payroll marks rows `payroll_effect = 'exported'`. This MVP does **not** compute
overtime pay amounts.

---

## Do Not Break

- **`UNIQUE(attendance_record_id)`** — the dedup guarantee. Never drop it.
- **`db.batch` atomicity** — approve/reject must stay single-batch operations.
- **Payroll reads approved requests, not `attendance_records.overtime_minutes`** —
  consuming both would double-count overtime.
- **`OvertimeValidationError`** must be exported from `$modules/hr` so routes catch
  it without importing internal paths.
- **No separate `employees` table** — `person_id` references `persons`.

---

## Extension Points

| When | What to add |
|------|-------------|
| Manual overtime entry | Add a service method that inserts with `source='manual'` (no attendance record); make `attendance_record_id` nullable + drop/relax the unique index |
| Employee self-service | New submit route; `source='employee_portal'` |
| Cancel request | Add `cancelOvertimeRequest`; batch UPDATE status='cancelled' + INSERT approval_record action='cancelled' |
| Overtime pay calc | Build in Payroll module consuming `getPayrollInputs`; multiply minutes × rate there |
