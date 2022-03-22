import * as randomWords from 'random-words';
import * as helpers from '../helpers';

let ctx: helpers.BackendContext;

beforeAll(async () => {
	ctx = await helpers.before();
});

afterAll(() => {
	return helpers.after(ctx);
});

describe('zombodb', () => {
	it('should search using zombodb index', async () => {
		let searchTerm = '';

		// Insert test data
		for (let idx = 0; idx < 100; idx++) {
			const words = randomWords({
				exactly: 5,
			});
			const message = randomWords({
				min: 3,
				max: 10,
			});
			searchTerm = message[2];
			await ctx.backend.insertElement(ctx.context, {
				version: '1.0.0',
				tags: randomWords({
					min: 1,
					max: 3,
				}),
				loop: null,
				markers: [],
				data: {
					payload: {
						message: message.join(' '),
					},
				},
				links: {},
				requires: [],
				capabilities: [],
				linked_at: {},
				created_at: new Date().toISOString(),
				active: true,
				type: 'card@1.0.0',
				name: words.join(' '),
				slug: ctx.generateRandomSlug({
					prefix: 'card',
				}),
			});
		}

		// Search using zombodb index and elasticsearch
		const query1 = `SELECT id,name,tags,data FROM cards WHERE cards ==> '${searchTerm}'`;
		console.log('Query:', query1);
		const results1 = await ctx.context.query(query1);
		console.log('Results:', JSON.stringify(results1, null, 4));
		const explainResults = await ctx.context.query(`EXPLAIN ${query1}`);
		console.log('Explain:', explainResults);
		expect(results1.length).toBeGreaterThan(0);

		// Should return zero results
		const query2 = `SELECT id,name,tags,data FROM cards WHERE cards ==> '${searchTerm}' AND type='user@1.0.0'`;
		const results2 = await ctx.context.query(query2);
		expect(results2.length).toEqual(0);

		// Should match the initial results
		const query3 = `SELECT id,name,tags,data FROM cards WHERE cards ==> '${searchTerm}' AND type='card@1.0.0'`;
		const results3 = await ctx.context.query(query3);
		expect(results3).toEqual(results1);
	});
});
