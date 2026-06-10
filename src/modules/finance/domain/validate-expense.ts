import { expenseRecordSchema } from './expense.schema';

export function validateExpenseRecord(input: unknown) {
	return expenseRecordSchema.safeParse(input);
}
