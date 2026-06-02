# Claude Code — HR Module Working Rules

Before making any change in this module, read:

1. `README.md` — HR module boundary and ownership overview.
2. `LEAVE_MANAGEMENT_CONTEXT.md` — if touching anything leave-related.

---

## Architecture

Always follow this call chain. Never skip layers.

```
SvelteKit route (+page.server.ts)
  → createLeaveApi / createHrApi  (src/modules/hr/leave-api.ts or api.ts)
    → LeaveService / HrService    (src/modules/hr/services/)
      → Repository classes        (src/modules/hr/repositories/)
        → Drizzle / D1
```

- Routes must not query the database directly.
- Routes must import only from the `$modules/hr` barrel (`src/modules/hr/index.ts`),
  never from internal paths like `$modules/hr/services/leave-service`.
- The boundary linter runs as part of `npm run check`. Keep it green.

---

## Leave Management specifics

- `approveLeaveRequest` and `rejectLeaveRequest` must go through `LeaveService`.
  Do not replicate their logic in route actions.
- Both operations use `db.batch([...])` for atomicity — three writes (request
  status, balance, approval record) must always stay in the same batch.
- `payrollEffect` lives only on `leave_requests`, not on `leave_balances`.
- Future Payroll integration reads `leave_requests WHERE payroll_effect =
  'pending_export'`. Do not modify `leave_balances` from the Payroll module.

---

## Schema changes

- `drizzle-kit generate` requires a TTY. Write migrations manually if running in
  a non-interactive shell (see `drizzle/migrations/0015_hr_leave_management.sql`
  as the template).
- Export new tables from `src/infrastructure/db/schema.ts`.

---

## What not to do

- Do not create a separate `employees` table — employee data lives in `persons`
  + `employee_profiles`.
- Do not add `payroll_effect` to `leave_balances`.
- Do not split approve/reject into sequential DB writes; the batch is intentional.
- Do not import `LeaveValidationError` from its internal path in routes; import
  from `$modules/hr`.
