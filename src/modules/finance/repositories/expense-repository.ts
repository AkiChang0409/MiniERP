import { and, asc, desc, eq, isNull, like, sql, type SQL } from 'drizzle-orm';
import type { DBClient } from '../../../infrastructure/db';
import { expenseCategories, expenses } from '../../../infrastructure/db/schema';

export const expenseSgdAmountExpr = (): SQL =>
	sql`CASE WHEN coalesce(${expenses.currency}, 'SGD') = 'SGD' THEN coalesce(nullif(${expenses.sgdEquivalent}, 0), ${expenses.amount}) ELSE coalesce(nullif(${expenses.sgdEquivalent}, 0), 0) END`;

export const projectExpenseOpexSumExpr = () =>
	sql<number>`coalesce(sum(case when ${expenses.expenseType} = 'opex' then ${expenseSgdAmountExpr()} else 0 end), 0)`;

export const projectExpenseSalesCostSumExpr = () =>
	sql<number>`coalesce(sum(case when ${expenses.expenseType} = 'sales_cost' then ${expenseSgdAmountExpr()} else 0 end), 0)`;

export const projectExpenseTotalSumExpr = () =>
	sql<number>`coalesce(sum(${expenseSgdAmountExpr()}), 0)`;

export class ExpenseRepository {
	constructor(private db: DBClient) {}

	async findById(expenseId: string) {
		const rows = await this.db
			.select()
			.from(expenses)
			.where(and(eq(expenses.id, expenseId), isNull(expenses.deletedAt)))
			.limit(1);

		return rows[0] ?? null;
	}

	async findProjectExpenseById(projectId: string, expenseId: string) {
		const rows = await this.db
			.select()
			.from(expenses)
			.where(
				and(
					eq(expenses.id, expenseId),
					eq(expenses.projectId, projectId),
					isNull(expenses.deletedAt)
				)
			)
			.limit(1);

		return rows[0] ?? null;
	}

	async findByProject(projectId: string) {
		return this.db
			.select()
			.from(expenses)
			.where(and(eq(expenses.projectId, projectId), isNull(expenses.deletedAt)))
			.orderBy(desc(expenses.date));
	}

	async getProjectExpenseSums(projectId: string) {
		const rows = await this.db
			.select({
				opex: projectExpenseOpexSumExpr(),
				salesCost: projectExpenseSalesCostSumExpr(),
				total: projectExpenseTotalSumExpr()
			})
			.from(expenses)
			.where(and(eq(expenses.projectId, projectId), isNull(expenses.deletedAt)));

		return {
			opex: rows[0]?.opex ?? 0,
			salesCost: rows[0]?.salesCost ?? 0,
			total: rows[0]?.total ?? 0
		};
	}

	async listCategories() {
		return this.db.select().from(expenseCategories).where(isNull(expenseCategories.deletedAt));
	}

	async getCategoryBreakdown(opts: { from?: string; to?: string } = {}) {
		const conditions = [isNull(expenses.deletedAt)];
		if (opts.from && opts.to) {
			conditions.push(sql`${expenses.date} between ${opts.from} and ${opts.to}`);
		}

		return this.db
			.select({
				category: expenses.category,
				expenseType: expenses.expenseType,
				total: sql<number>`coalesce(sum(${expenseSgdAmountExpr()}), 0)`,
				count: sql<number>`count(*)`
			})
			.from(expenses)
			.where(and(...conditions))
			.groupBy(expenses.category, expenses.expenseType)
			.orderBy(desc(projectExpenseTotalSumExpr()));
	}
}

// ---------------------------------------------------------------------------
// ExpenseCategoryRepository — hierarchy-aware CRUD for the expense_categories table
// ---------------------------------------------------------------------------

export type CategoryRow = typeof expenseCategories.$inferSelect;

export type CreateCategoryInput = {
	id?: string;
	name: string;
	parentId?: string | null;
	isSystem?: boolean;
};

export type UpdateCategoryInput = {
	name?: string;
	parentId?: string | null;
};

export class ExpenseCategoryRepository {
	constructor(private db: DBClient) {}

	async findById(id: string): Promise<CategoryRow | null> {
		const rows = await this.db
			.select()
			.from(expenseCategories)
			.where(and(eq(expenseCategories.id, id), isNull(expenseCategories.deletedAt)))
			.limit(1);
		return rows[0] ?? null;
	}

	async listAll(): Promise<CategoryRow[]> {
		return this.db
			.select()
			.from(expenseCategories)
			.where(isNull(expenseCategories.deletedAt))
			.orderBy(asc(expenseCategories.name));
	}

	async listRoots(): Promise<CategoryRow[]> {
		return this.db
			.select()
			.from(expenseCategories)
			.where(and(isNull(expenseCategories.parentId), isNull(expenseCategories.deletedAt)))
			.orderBy(asc(expenseCategories.name));
	}

	async listChildren(parentId: string): Promise<CategoryRow[]> {
		return this.db
			.select()
			.from(expenseCategories)
			.where(and(eq(expenseCategories.parentId, parentId), isNull(expenseCategories.deletedAt)))
			.orderBy(asc(expenseCategories.name));
	}

	async search(query: string): Promise<CategoryRow[]> {
		return this.db
			.select()
			.from(expenseCategories)
			.where(and(like(expenseCategories.name, `%${query}%`), isNull(expenseCategories.deletedAt)))
			.orderBy(asc(expenseCategories.name));
	}

	async create(input: CreateCategoryInput): Promise<CategoryRow> {
		const now = new Date().toISOString();
		const id = input.id ?? crypto.randomUUID();
		const row = {
			id,
			name: input.name,
			parentId: input.parentId ?? null,
			isSystem: input.isSystem ? 'true' : 'false',
			createdAt: now,
			updatedAt: now
		};
		await this.db.insert(expenseCategories).values(row);
		return { ...row, deletedAt: null };
	}

	async update(id: string, input: UpdateCategoryInput): Promise<boolean> {
		const existing = await this.findById(id);
		if (!existing) return false;

		const now = new Date().toISOString();
		const sets: Record<string, unknown> = { updatedAt: now };
		if (input.name !== undefined) sets.name = input.name;
		if (input.parentId !== undefined) sets.parentId = input.parentId;

		await this.db
			.update(expenseCategories)
			.set(sets)
			.where(and(eq(expenseCategories.id, id), isNull(expenseCategories.deletedAt)));
		return true;
	}

	async deactivate(id: string): Promise<boolean> {
		const existing = await this.findById(id);
		if (!existing) return false;

		const now = new Date().toISOString();
		await this.db
			.update(expenseCategories)
			.set({ deletedAt: now, updatedAt: now })
			.where(and(eq(expenseCategories.id, id), isNull(expenseCategories.deletedAt)));
		return true;
	}

	async reactivate(id: string): Promise<boolean> {
		const now = new Date().toISOString();
		await this.db
			.update(expenseCategories)
			.set({ deletedAt: null, updatedAt: now })
			.where(eq(expenseCategories.id, id));
		return true;
	}

	async getHierarchy(): Promise<Array<CategoryRow & { children: CategoryRow[] }>> {
		const all = await this.listAll();
		const childrenMap = new Map<string | null, CategoryRow[]>();
		for (const cat of all) {
			const key = cat.parentId ?? null;
			if (!childrenMap.has(key)) childrenMap.set(key, []);
			childrenMap.get(key)!.push(cat);
		}
		const roots = childrenMap.get(null) ?? [];
		return roots.map((root) => ({
			...root,
			children: childrenMap.get(root.id) ?? []
		}));
	}

	async syncFromCatalog(
		catalog: Array<{ id: string; name: string; parentId?: string | null; isSystem?: boolean }>
	): Promise<{ created: number; updated: number }> {
		let created = 0;
		let updated = 0;
		const now = new Date().toISOString();

		for (const entry of catalog) {
			const [existing] = await this.db
				.select()
				.from(expenseCategories)
				.where(eq(expenseCategories.id, entry.id))
				.limit(1);

			if (existing) {
				if (existing.name !== entry.name || existing.parentId !== (entry.parentId ?? null)) {
					await this.db
						.update(expenseCategories)
						.set({
							name: entry.name,
							parentId: entry.parentId ?? null,
							deletedAt: null,
							updatedAt: now
						})
						.where(eq(expenseCategories.id, entry.id));
					updated++;
				}
			} else {
				await this.db.insert(expenseCategories).values({
					id: entry.id,
					name: entry.name,
					parentId: entry.parentId ?? null,
					isSystem: entry.isSystem !== false ? 'true' : 'false',
					createdAt: now,
					updatedAt: now
				});
				created++;
			}
		}

		return { created, updated };
	}
}
