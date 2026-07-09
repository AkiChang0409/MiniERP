import { beforeEach, describe, expect, it, vi } from 'vitest';
import { salesCrmAnswerQuestionCapability } from '$modules/sales-crm/ai-capabilities';

const mocks = vi.hoisted(() => ({
	listCustomerDirectory: vi.fn(),
	runStructuredOutput: vi.fn()
}));

vi.mock('$modules/sales-crm/api', () => ({
	createSalesCrmApi: () => ({
		listCustomerDirectory: mocks.listCustomerDirectory
	})
}));

vi.mock('$platform/ai/ai-runtime', () => ({
	runStructuredOutput: mocks.runStructuredOutput
}));

describe('salesCrmAnswerQuestionCapability', () => {
	beforeEach(() => {
		mocks.listCustomerDirectory.mockReset();
		mocks.runStructuredOutput.mockReset();
	});

	it('answers customer directory questions directly from the CRM snapshot', async () => {
		mocks.listCustomerDirectory.mockResolvedValue([
			{ id: 'cus_1', name: 'Acme Pte Ltd', contact: 'Alice', address: 'Singapore' },
			{ id: 'cus_2', name: 'Beta Trading', contact: null, address: null }
		]);

		const output = await salesCrmAnswerQuestionCapability.execute(
			{ question: '我们的客户有哪些？' },
			{
				env: { AI: {} } as Env,
				moduleContext: {} as never
			}
		);

		expect(output.needsHuman).toBe(false);
		expect(output.answer).toContain('我们目前有 2 个客户');
		expect(output.answer).toContain('Acme Pte Ltd');
		expect(output.answer).toContain('联系人：Alice');
		expect(output.answer).toContain('Beta Trading');
		expect(mocks.runStructuredOutput).not.toHaveBeenCalled();
	});
});
