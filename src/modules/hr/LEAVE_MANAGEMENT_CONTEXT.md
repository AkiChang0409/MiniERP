# Leave Management — Implementation Context

> This document is the authoritative implementation reference for HR Leave
> Management. Read it before touching any leave-related file.

---

## Scope (what is and is not here)

**In scope — admin-side Leave Management (Sprint 2 MVP)**

- HR/Admin can view, approve, and reject employee leave requests.
- Leave balance tracking (entitled / used / pending days) per person × type × year.
- Audit trail: every approve/reject writes a `leave_approval_records` row.
- Payroll effect placeholder on `leave_requests` (unpaid leave only).

**In scope — employee self-service (Sprint 2 MVP, added 2026-06-08)**

- Logged-in employee views own balances + request history and submits a new
  request at `/employee/leave`. personId is resolved server-side via
  `resolveCurrentPersonId(db, userId)` — never from the form.
- Submit creates a `pending` request with `source = 'employee_portal'` and bumps
  `leave_balances.pendingDays`; approval still happens admin-side on `/hr/leave`.

**Explicitly out of scope in this implementation**

- Employee cancel / withdraw of own requests.
- Attachment upload, notifications, payroll calculation or payslip generation.
- Attendance or overtime tracking.

---

## Key File Map

| Layer | File |
|-------|------|
| Schema | `src/modules/hr/repositories/leave.schema.ts` |
| Repositories | `src/modules/hr/repositories/leave-repository.ts` |
| Service | `src/modules/hr/services/leave-service.ts` |
| Public API factory (admin) | `src/modules/hr/leave-api.ts` |
| Public API factory (employee) | `src/modules/hr/employee-leave-api.ts` |
| Route — admin (load + actions) | `src/routes/(app)/hr/leave/+page.server.ts` |
| UI — admin | `src/routes/(app)/hr/leave/+page.svelte` |
| Route — employee (load + submit) | `src/routes/(app)/employee/leave/+page.server.ts` |
| UI — employee | `src/routes/(app)/employee/leave/+page.svelte` |
| Person resolver | `src/platform/auth/resolve-current-person.ts` |
| Migration | `drizzle/migrations/0015_hr_leave_management.sql` |
| Seed | `drizzle/seeds/leave-seed.sql` |
| Unit tests | `src/test/unit/leave-service.test.ts` |
| Integration tests (admin) | `src/test/integration/leave-service.integration.test.ts` |
| Integration tests (employee) | `src/test/integration/employee-leave.integration.test.ts` |

The public boundary is `src/modules/hr/index.ts`. Routes must import
`createLeaveApi` and `LeaveValidationError` from `$modules/hr`, never from
internal paths.

---

## Data Model (4 tables)

### `leave_types`

Master data. Pre-seeded with ANNUAL / SICK / HOSP / UNPAID.

| Column | Notes |
|--------|-------|
| `id` | text PK |
| `code` | UNIQUE — ANNUAL / SICK / HOSP / UNPAID |
| `affects_payroll` | `true` only for UNPAID; drives `payrollEffect` on approval |
| `status` | `active` / `inactive` |

### `leave_requests`

One row per leave application.

| Column | Notes |
|--------|-------|
| `person_id` | FK → `persons.id` |
| `leave_type_id` | FK → `leave_types.id` |
| `status` | `pending` → `approved` / `rejected` / `cancelled` |
| `source` | `mock` / `manual` / `employee_portal` / `imported` |
| `payroll_effect` | `not_applicable` / `pending_export` / `exported` (see below) |
| `approved_by_user_id` | snapshot of approving user's id |
| `rejected_by_user_id` | snapshot of rejecting user's id |

### `leave_balances`

Per-person × per-type × per-year entitlement counter.

| Column | Notes |
|--------|-------|
| `entitled_days` | set at year start or by HR |
| `used_days` | incremented on approve |
| `pending_days` | incremented when request is submitted; decremented on approve or reject |
| `remaining_days` | **not stored** — computed in service as `entitled − used − pending` |

Unique constraint: `(person_id, leave_type_id, year)`.

`leave_balances` does **not** contain `payroll_effect`. That field lives only on
`leave_requests`.

### `leave_approval_records`

Immutable audit log. One row per approve/reject action.

| Column | Notes |
|--------|-------|
| `actor_id` | snapshot of `ctx.user.id` at action time |
| `actor_name` | snapshot of `ctx.user.email` — does not change if user is renamed |
| `from_status` / `to_status` | state transition |
| `comment` | approval comment or rejection reason |

---

## Approve / Reject Business Flow

Both operations are handled exclusively by `LeaveService` and executed as a
single `db.batch([...])` call so all three writes are atomic.

### `approveLeaveRequest(id, comment?)`

1. `leaveRequestRepo.findById(id)` — throws `LeaveValidationError('Leave request not found')` if missing.
2. Asserts `status === 'pending'` — throws `LeaveValidationError('Only pending requests can be approved')` otherwise.
3. `leaveTypeRepo.findById(request.leaveTypeId)` — determines `payrollEffect`.
4. `db.batch([` three statements `])`:
   - `UPDATE leave_requests SET status='approved', approved_by_user_id, approved_at, payroll_effect, updated_at`
   - `UPDATE leave_balances SET pending_days -= totalDays, used_days += totalDays, updated_at`
   - `INSERT leave_approval_records (action='approved', ...)`

### `rejectLeaveRequest(id, reason)`

1–2. Same validation as approve (throws `'Only pending requests can be rejected'`).
3. `db.batch([` three statements `])`:
   - `UPDATE leave_requests SET status='rejected', rejected_by_user_id, rejected_at, rejection_reason, updated_at`
   - `UPDATE leave_balances SET pending_days -= totalDays, updated_at` — releases pending, **does not touch `used_days`**
   - `INSERT leave_approval_records (action='rejected', ...)`

---

## Employee Self-Service Flow (`/employee/leave`)

The employee portal is served by `createEmployeeLeaveApi(ctx, personId)`
(`employee-leave-api.ts`). The facade **binds `personId` at construction** and
exposes no method that accepts a personId argument, so a forged form field can
never redirect reads/writes to another employee. Approve/reject are deliberately
absent from this facade — they remain admin-only on `createLeaveApi`.

**Route guard.** `/employee/*` is not mapped to any module in
`module-access.ts`, so `isPathAllowedForRole` returns `true` for any
authenticated user (identity ≠ role). The portal gates on the *link*, not a
role.

**Load (`+page.server.ts`):**
1. `resolveCurrentPersonId(ctx.db, locals.user?.id)` → `null` ⇒ render
   "账号尚未关联员工档案" (`linkState: 'unlinked'`), never a 500.
2. `getProfileStatus()` ≠ `'active'` ⇒ render "账号未启用"
   (`linkState: 'inactive'`).
3. Otherwise load `listLeaveTypes()` + `listMyBalances(year)` +
   `listMyRequests()`.

**`listMyLeaveBalances`** calls `ensureLeaveBalancesForPerson` first, which
seeds one `leave_balances` row per active leave type when none exist (mock
entitlements: `LeaveService.DEFAULT_ENTITLEMENT` — ANNUAL/SICK 14, HOSP 60,
UNPAID 5, else 14). Idempotent against the `(person, type, year)` unique index.

**`submitLeaveRequest({ personId, leaveTypeId, startDate, endDate, reason })`:**
1. leave type must exist and be `active`.
2. dates must be `YYYY-MM-DD`; `endDate >= startDate`.
3. `totalDays = expandDateRange(start, end).length` (inclusive calendar days).
4. ensure balance row exists, then enforce
   `remaining (entitled − used − pending) >= totalDays`, else
   `LeaveValidationError`.
5. `db.batch([` INSERT `leave_requests` (status `pending`, source
   `employee_portal`, payrollEffect `not_applicable`) + UPDATE
   `leave_balances.pendingDays += totalDays` `])` — atomic.

Handoff to admin: the new `pending` row appears in `/hr/leave` Requests tab; HR
approve/reject runs the existing batch, which moves pending → used (approve) or
releases pending (reject). No employee-side approval path exists.

---

## `db.batch` Atomicity

The project uses `drizzle-orm/d1`. Cloudflare D1's native batch semantics
guarantee that all statements in a `db.batch([...])` call either all succeed or
all roll back — equivalent to a transaction for these three-write operations.

The TypeScript cast in the service:

```typescript
await (this.db.batch as (
    stmts: Parameters<typeof this.db.batch>[0]
) => ReturnType<typeof this.db.batch>)([...]);
```

is required because Drizzle's D1 batch types enforce a tuple length at compile
time. The cast is safe — the runtime behaviour is correct.

---

## Seed Data

File: `drizzle/seeds/leave-seed.sql`

- Always inserts 4 `leave_types` rows (INSERT OR IGNORE — idempotent).
- Inserts mock `leave_requests` and `leave_balances` only if `employee_profiles`
  contains at least one active employee (subquery guards — safe no-op otherwise).
- 6 mock requests covering all statuses; 7 balance rows; 3 approval records.

**Re-run seed against local D1:**

```bash
npx wrangler d1 execute smartfin-db-v4 --local --file drizzle/seeds/leave-seed.sql
```

**Re-run migration if schema was reset:**

```bash
npx wrangler d1 execute smartfin-db-v4 --local --file drizzle/migrations/0015_hr_leave_management.sql
```

> `db:generate` requires a TTY terminal. Migration `0008` was written manually.
> Future schema changes need either a TTY session or manual migration authoring.
> See project memory `feedback_drizzle_kit_tty.md` for details.

---

## `payrollEffect` Design

`payroll_effect` lives **only** on `leave_requests`, never on `leave_balances`.

| Value | Meaning |
|-------|---------|
| `not_applicable` | Leave type has `affects_payroll = false` (annual, sick, hosp) |
| `pending_export` | Unpaid leave approved but not yet picked up by payroll |
| `exported` | Payroll has processed this row |

On approval: if `leaveType.affectsPayroll === true`, set `payroll_effect =
'pending_export'`; otherwise `'not_applicable'`.

---

## Future Payroll Integration

When the Payroll module is implemented, it should:

```sql
SELECT * FROM leave_requests
WHERE status = 'approved'
  AND payroll_effect = 'pending_export'
  AND deleted_at IS NULL;
```

After exporting, mark rows as exported:

```sql
UPDATE leave_requests SET payroll_effect = 'exported' WHERE id IN (...);
```

**Do not** directly modify `leave_balances` from the Payroll module. The balance
is managed exclusively by `LeaveService` through the approve/reject batch.

---

## Attendance Sync

When `approveLeaveRequest` commits successfully, `LeaveService` immediately calls
`syncLeaveToAttendance(personId, startDate, endDate, leaveRequestId)`.

This writes one `attendance_records` row per calendar date in the leave range:

| Field | Value |
|-------|-------|
| `status` | `on_leave` |
| `source` | `leave_sync` |
| `payroll_effect` | `not_applicable` (always — see note below) |
| `check_in/out_time` | `null` |
| `worked_minutes` | `null` |
| `notes` | `leave_sync:<leaveRequestId>` |

**Overwrite policy:**
- No existing record → INSERT
- Existing with `source ∈ {mock, manual, leave_sync}` → UPDATE to `on_leave`
- Existing with `source ∈ {mobile, terminal, employee_portal}` → skip (TODO: conflict flag)

**Payroll note:** Even for Unpaid Leave (`affectsPayroll = true`), the attendance
record's `payroll_effect` is always `not_applicable`. Payroll processes Unpaid Leave
via `leave_requests.payroll_effect = pending_export` — not via `attendance_records`.
This prevents double-counting.

### Backfill

```typescript
await leave.syncBackfill(dateFrom, dateTo);
// Returns the count of approved leave requests processed.
// Safe to re-run — idempotent per (personId, workDate).
```

Use this after importing historical leave data or after retroactively approving requests.

---

## Extension Points

| When | What to add |
|------|-------------|
| Employee self-service | **DONE (2026-06-08)** — see "Employee Self-Service Flow" below |
| Cancel leave | Add `cancelLeaveRequest` to `LeaveService`; batch: UPDATE status='cancelled', UPDATE pendingDays -= totalDays, INSERT approval_record action='cancelled' |
| Leave policy enforcement | Add quota check in `approveLeaveRequest` (compare `remainingDays` before approval) |
| AI Panel actions | Add `leaveActions` array to `src/modules/hr/index.ts` following the `employeeActions` pattern |
| Payroll export UI | Query `payroll_effect = 'pending_export'` and render export queue |

---

## Do Not Break

- **`db.batch` atomicity** — approve and reject must remain batch operations.
  Never split them into sequential awaits.
- **`leave_balances` unique constraint** — `(person_id, leave_type_id, year)` is
  enforced at DB level. Any upsert on submit must use `INSERT OR IGNORE` /
  `ON CONFLICT` handling.
- **No `payroll_effect` on `leave_balances`** — this column belongs only on
  `leave_requests`.
- **`LeaveValidationError`** must be exported from the HR module barrel
  (`$modules/hr`) so routes can catch it without importing internal paths.
- **Modular boundary** — routes import only from `$modules/hr`. The boundary
  linter (`npm run check:modular-boundary`) enforces this.
