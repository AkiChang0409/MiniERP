import { describe, it, expect } from 'vitest';
import { estimateSingaporeResidentTax } from '$modules/finance';

describe('estimateSingaporeResidentTax', () => {
	it('returns 0 for zero income', () => {
		expect(estimateSingaporeResidentTax(0)).toBe(0);
	});

	it('returns 0 for negative income', () => {
		expect(estimateSingaporeResidentTax(-5000)).toBe(0);
	});

	it('returns 0 for NaN input', () => {
		expect(estimateSingaporeResidentTax(NaN)).toBe(0);
	});

	it('returns 0 for Infinity input', () => {
		// Infinity is not finite so guard fires
		expect(estimateSingaporeResidentTax(Infinity)).toBe(0);
	});

	it('returns 0 for income within the first 20k band (0% rate)', () => {
		expect(estimateSingaporeResidentTax(10000)).toBe(0);
		expect(estimateSingaporeResidentTax(20000)).toBe(0);
	});

	it('applies 2% on income 20001–30000', () => {
		// 10000 × 2% = 200
		expect(estimateSingaporeResidentTax(30000)).toBe(200);
	});

	it('applies 3.5% on income 30001–40000', () => {
		// 200 (prev bands) + 10000 × 3.5% = 200 + 350 = 550
		expect(estimateSingaporeResidentTax(40000)).toBe(550);
	});

	it('applies 7% on income 40001–80000', () => {
		// 550 + 40000 × 7% = 550 + 2800 = 3350
		expect(estimateSingaporeResidentTax(80000)).toBe(3350);
	});

	it('applies 24% on income above the top band', () => {
		// Top explicit band ends at 500k (20+10+10+40+40+40+40+40+40+40+180 = 500k)
		// Income above 500k → 24% on excess
		const base = estimateSingaporeResidentTax(500000);
		const withExtra = estimateSingaporeResidentTax(600000);
		expect(withExtra - base).toBeCloseTo(100000 * 0.24, 2);
	});

	it('rounds result to 2 decimal places', () => {
		const result = estimateSingaporeResidentTax(25000);
		// 5000 × 2% = 100.00 — exact, but verify no extra decimals
		expect(result).toBe(100);
	});

	it('produces identical results for the same input (deterministic)', () => {
		expect(estimateSingaporeResidentTax(120000)).toBe(estimateSingaporeResidentTax(120000));
	});
});
