import { revenueRecordSchema } from '../schemas/revenue.schema';

export function validateRevenueRecord(input: unknown) {
	return revenueRecordSchema.safeParse(input);
}
