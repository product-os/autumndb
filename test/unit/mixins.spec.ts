import { Jellyscript } from '@balena/jellyfish-jellyscript';
import type { JsonSchema } from '@balena/jellyfish-types';
import { contractMixins } from '../../lib';

describe('contractMixins', () => {
	describe('.withEvents()', () => {
		it('should create a valid formula', () => {
			const typeContract = contractMixins.withEvents('test-type', 'type');
			const schema: JsonSchema = typeContract.data.schema as any;
			const sample: any = {
				name: 'sample contract',
				type: 'test-type',
				slug: 'test-sample',
				tags: ['foo'],
				links: {
					'has attached element': [
						{
							type: 'create',
							slug: 'foo-1',
						},
						{
							type: 'update@1.0.0',
							slug: 'foo-2',
						},
						{
							type: 'message@1.0.0',
							slug: 'foo-3',
							tags: ['test-tag'],
						},
					],
				},
			};
			const result = new Jellyscript().evaluateObject(schema, sample);

			expect(result.tags).toEqual(['foo', 'test-tag']);
		});
	});
});
