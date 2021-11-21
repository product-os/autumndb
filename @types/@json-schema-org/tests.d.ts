// TS-TODO: Contribute these types back to the `@json-schema-org/tests` repo
declare module '@json-schema-org/tests' {
	type ValidatorFactory = (
		schema: any,
		options: any,
	) => { valid: boolean; errors: any[] };
	type TestFilter = (file: any, parent: any, optional: any) => boolean;
	interface TestDefinition {
		description: string;
		schema: any;
		tests: Array<{
			description: string;
			data: any;
			valid: boolean;
		}>;
	}

	interface TestSuite {
		name: string;
		file: string;
		optional: boolean;
		schemas: TestDefinition[];
	}

	export function testSync(
		validatorFactory: ValidatorFactory,
		options: any,
		filter: TestFilter,
		draft: 'draft3' | 'draft4',
	): any;

	export function loadSync(options: any): TestSuite[];

	export function draft3(filter?: TestFilter): TestSuite[];

	export function draft4(filter?: TestFilter): TestSuite[];

	export function draft6(filter?: TestFilter): TestSuite[];

	export function draft7(filter?: TestFilter): TestSuite[];

	export function loadAllSync(draft: string): TestSuite[];

	export function loadRequiredSync(draft: string): TestSuite[];

	export function loadOptionalSync(draft: string): TestSuite[];

	export const requiredOnlyFilter: TestFilter;

	export const optionalOnlyFilter: TestFilter;
}
