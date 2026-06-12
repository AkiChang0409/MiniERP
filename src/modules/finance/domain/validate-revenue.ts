import { revenueRecordSchema } from './revenue.schema';

export function validateRevenueRecord(input: unknown) {
	return revenueRecordSchema.safeParse(input);
}
