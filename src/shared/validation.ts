/**
 * Validates that a value is a non-empty string.
 * Throws an error with a descriptive message if validation fails.
 */
export function validateNonEmptyString(
	value: string | null | undefined,
	fieldName: string,
	context: string,
): asserts value is string {
	if (typeof value !== "string" || !value) {
		throw new Error(
			`Plaindown ${fieldName} must be a non-empty string for ${context}, got: ${typeof value}`,
		);
	}
}
