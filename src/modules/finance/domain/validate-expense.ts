import { expenseRecordSchema } from '../schemas/expense.schema';

export function validateExpenseRecord(input: unknown) {
	return expenseRecordSchema.safeParse(input);
}
