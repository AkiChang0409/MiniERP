/**
 * Small, defensive codecs for Lark Bitable field values.
 *
 * Bitable field payload shapes vary by field type and sometimes by API surface.
 * These helpers normalize the common shapes without making business modules
 * depend on ad hoc string parsing.
 */

export type BitableRawFields = Record<string, unknown>;

interface TextLikeObject {
	text?: unknown;
	name?: unknown;
	value?: unknown;
	link?: unknown;
}

function objectValue(value: unknown, keys: string[]): unknown {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
	const record = value as Record<string, unknown>;
	for (const key of keys) {
		if (record[key] != null) return record[key];
	}
	return undefined;
}

function primitiveText(value: unknown): string | null {
	if (value == null) return null;
	if (typeof value === 'string') return value.trim() || null;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	return null;
}

/** Extract human-readable text from common Bitable text/select/formula values. */
export function bitablePlainText(value: unknown): string | null {
	const primitive = primitiveText(value);
	if (primitive) return primitive;

	if (Array.isArray(value)) {
		const parts = value.map(bitablePlainText).filter((part): part is string => Boolean(part));
		return parts.join(', ').trim() || null;
	}

	if (value && typeof value === 'object') {
		const textLike = objectValue(value, ['text', 'name', 'value']) as TextLikeObject[keyof TextLikeObject];
		return primitiveText(textLike);
	}

	return null;
}

/** Extract linked Bitable record ids from relation field values. */
export function bitableLinkedRecordIds(value: unknown): string[] {
	if (value == null) return [];
	if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
	if (Array.isArray(value)) {
		return value
			.flatMap((item) => bitableLinkedRecordIds(item))
			.filter((id, index, all) => all.indexOf(id) === index);
	}
	if (value && typeof value === 'object') {
		const raw =
			objectValue(value, ['record_id', 'recordId', 'id']) ??
			objectValue(value, ['record_ids', 'recordIds', 'ids']);
		return bitableLinkedRecordIds(raw);
	}
	return [];
}

/** Normalize single-select values to their label. */
export function bitableSelectLabel(value: unknown): string | null {
	return bitablePlainText(value);
}

/** Normalize checkbox values. Empty/null is null so callers can distinguish unknown from false. */
export function bitableCheckbox(value: unknown): boolean | null {
	if (value == null || value === '') return null;
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return value !== 0;
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		if (['true', 'yes', '1', 'checked'].includes(normalized)) return true;
		if (['false', 'no', '0', 'unchecked'].includes(normalized)) return false;
	}
	return null;
}

/** Normalize number/currency-like values. */
export function bitableNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const normalized = value.replace(/,/g, '').trim();
		if (!normalized) return null;
		const parsed = Number(normalized);
		return Number.isFinite(parsed) ? parsed : null;
	}
	if (value && typeof value === 'object') {
		return bitableNumber(objectValue(value, ['value', 'number']));
	}
	return null;
}

/** Normalize phone values from plain text or phone field objects. */
export function bitablePhoneText(value: unknown): string | null {
	const text =
		bitablePlainText(objectValue(value, ['full_phone_number', 'phone_number', 'formatted_phone_number'])) ??
		bitablePlainText(value);
	return text?.replace(/\s+/g, ' ').trim() || null;
}

export interface BitableSelectContract {
	field: string;
	options: readonly string[];
}

export function assertBitableSelectOption(contract: BitableSelectContract, value: string | null | undefined): void {
	if (value == null || value === '') return;
	if (!contract.options.includes(value)) {
		throw new Error(
			`Invalid Bitable select option for ${contract.field}: ${value}. Expected one of: ${contract.options.join(
				', '
			)}`
		);
	}
}

export function omitReadonlyBitableFields<T extends BitableRawFields>(
	fields: T,
	readonlyFields: ReadonlySet<string>
): BitableRawFields {
	return Object.fromEntries(Object.entries(fields).filter(([field]) => !readonlyFields.has(field)));
}
