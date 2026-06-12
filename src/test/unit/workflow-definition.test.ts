import { describe, it, expect } from 'vitest';
import {
	financialDocumentIntakeWorkflow,
	findFinancialDocumentIntakeStep,
	type FinancialDocumentIntakeStepId
} from '$modules/finance/workflows/financial-document-intake/definition';

describe('financialDocumentIntakeWorkflow definition', () => {
	it('has exactly 10 steps', () => {
		expect(financialDocumentIntakeWorkflow.steps).toHaveLength(10);
	});

	it('starts at trigger step', () => {
		expect(financialDocumentIntakeWorkflow.initialStep).toBe('trigger');
	});

	it('every step id is unique', () => {
		const ids = financialDocumentIntakeWorkflow.steps.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe('findFinancialDocumentIntakeStep', () => {
	it('returns undefined for an unknown step id', () => {
		expect(findFinancialDocumentIntakeStep('unknown' as FinancialDocumentIntakeStepId)).toBeUndefined();
	});

	it.each([
		['trigger', 'R0'],
		['document_intake', 'R1'],
		['bucket_selection', 'R0'],
		['category_selection', 'R0'],
		['field_extraction', 'R2'],
		['matching', 'R1'],
		['project_selection', 'R0'],
		['user_confirmation', 'R3'],
		['record_creation', 'R4'],
		['completion', 'R0']
	] as [FinancialDocumentIntakeStepId, string][])(
		'step "%s" has risk level %s',
		(stepId, expectedRisk) => {
			const step = findFinancialDocumentIntakeStep(stepId);
			expect(step?.riskLevel).toBe(expectedRisk);
		}
	);

	it('only user_confirmation and record_creation require user confirmation', () => {
		const confirmationRequired = financialDocumentIntakeWorkflow.steps
			.filter((s) => s.requiresUserConfirmation)
			.map((s) => s.id);
		expect(confirmationRequired).toEqual(['user_confirmation', 'record_creation']);
	});

	it('field_extraction authorises finance.extract-document-fields capability', () => {
		const step = findFinancialDocumentIntakeStep('field_extraction')!;
		expect(step.allowedCapabilities).toContain('finance.extract-document-fields');
	});

	it('matching authorises supplier and purchase-order match capabilities', () => {
		const step = findFinancialDocumentIntakeStep('matching')!;
		expect(step.allowedCapabilities).toContain('finance.match-supplier');
		expect(step.allowedCapabilities).toContain('finance.match-purchase-order');
	});

	it('record_creation is R4 and authorises all three write capabilities', () => {
		const step = findFinancialDocumentIntakeStep('record_creation')!;
		expect(step.riskLevel).toBe('R4');
		expect(step.allowedCapabilities).toContain('finance.create-expense-record');
		expect(step.allowedCapabilities).toContain('finance.create-revenue-record');
		expect(step.allowedCapabilities).toContain('finance.create-document-archive');
	});

	it('trigger leads only to document_intake', () => {
		const step = findFinancialDocumentIntakeStep('trigger')!;
		expect(step.nextSteps).toEqual(['document_intake']);
	});

	it('field_extraction can branch to matching, project_selection or user_confirmation', () => {
		const step = findFinancialDocumentIntakeStep('field_extraction')!;
		expect(step.nextSteps).toContain('matching');
		expect(step.nextSteps).toContain('project_selection');
		expect(step.nextSteps).toContain('user_confirmation');
	});

	it('completion is a terminal step with no next steps', () => {
		const step = findFinancialDocumentIntakeStep('completion')!;
		expect(step.nextSteps).toHaveLength(0);
	});

	it('record_creation leads only to completion', () => {
		const step = findFinancialDocumentIntakeStep('record_creation')!;
		expect(step.nextSteps).toEqual(['completion']);
	});
});
