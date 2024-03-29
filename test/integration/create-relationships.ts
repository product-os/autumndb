import { strict as assert } from 'assert';
import * as _ from 'lodash';
import { RelationshipContract } from '../../lib';
import { TestContext } from '../../lib/test-utils';

// Create the relationships which are not already part of the kernel
export async function createRelationships(ctx: TestContext) {
	const relSpecs: any[] = [
		{
			fromVersionedType: 'user',
			toVersionedType: 'org',
			name: 'is member of',
			inverseName: 'has member',
			title: 'User',
			inverseTitle: 'Organization',
		},
		{
			fromVersionedType: 'card',
			toVersionedType: 'org',
			name: 'is part of',
			inverseName: 'has member',
			title: 'Card',
			inverseTitle: 'Organization',
		},
		{
			fromVersionedType: 'card',
			toVersionedType: 'card',
			name: 'is attached to',
			inverseName: 'has attached element',
			title: 'Attachment',
			inverseTitle: 'Attachment',
		},
		{
			fromVersionedType: 'card',
			toVersionedType: 'card',
			name: 'is linked to',
			inverseName: 'is linked to',
			title: 'Link',
			inverseTitle: 'Link',
		},
		{
			fromVersionedType: 'card',
			toVersionedType: 'card',
			name: 'is child of',
			inverseName: 'has child', // It is defined like this in tests above
			title: 'Card',
			inverseTitle: 'Card',
		},
		{
			fromVersionedType: 'card',
			toVersionedType: 'card',
			name: 'is appended to',
			inverseName: 'has appended element',
			title: 'Card',
			inverseTitle: 'Card',
		},
		{
			fromVersionedType: 'card',
			toVersionedType: 'card',
			name: 'is owned by',
			inverseName: 'owns',
			title: 'Card',
			inverseTitle: 'Owner',
		},
		{
			fromVersionedType: 'card',
			toVersionedType: 'card',
			name: 'works at',
			inverseName: 'has worker',
			title: 'Worker',
			inverseTitle: 'Workplace',
		},
		{
			fromVersionedType: 'card',
			toVersionedType: 'card',
			name: 'believes in',
			inverseName: 'is believed by',
			title: 'Believer',
			inverseTitle: 'Deity',
		},
		{
			fromVersionedType: 'card',
			toVersionedType: 'card',
			name: 'reports to',
			inverseName: 'receives reports from',
			title: 'Reporter',
			inverseTitle: 'Manager',
		},
		{
			fromVersionedType: 'card',
			toVersionedType: '*',
			name: 'is xxx-card-to-wildcard-xxx to',
			inverseName: 'has xxx-card-to-wildcard-xxx element',
			title: 'Left',
			inverseTitle: 'Right',
		},
		{
			fromVersionedType: '*',
			toVersionedType: 'card',
			name: 'is xxx-wildcard-to-card-xxx to',
			inverseName: 'has xxx-wildcard-to-card-xxx element',
			title: 'Left',
			inverseTitle: 'Right',
		},
		{
			fromVersionedType: 'card@1.0.0',
			toVersionedType: 'card',
			name: 'is xxx-versioned-to-card-xxx to',
			inverseName: 'has xxx-versioned-to-card-xxx element',
			title: 'Left',
			inverseTitle: 'Right',
		},
		{
			fromVersionedType: 'card',
			toVersionedType: 'card',
			name: 'is xxx-forward-xxx to',
			inverseName: 'is xxx-reverse-xxx to',
			title: 'Left',
			inverseTitle: 'Right',
		},
		{
			fromVersionedType: 'card@1.0.0',
			toVersionedType: '*',
			name: 'forwards to',
			inverseName: 'is forwarded by',
			title: 'Card',
			inverseTitle: 'Destination',
		},
	];

	const relContracts = relSpecs.map((spec) => {
		const fromType =
			spec.fromVersionedType === '*'
				? 'any'
				: spec.fromVersionedType.split('@')[0];
		const toType =
			spec.toVersionedType === '*' ? 'any' : spec.toVersionedType.split('@')[0];
		const dashedName = _.kebabCase(spec.name);
		return {
			slug: `relationship-${fromType}-${dashedName}-${toType}`,
			type: 'relationship@1.0.0',
			name: spec.name,
			data: {
				inverseName: spec.inverseName,
				title: spec.title,
				inverseTitle: spec.inverseTitle,
				from: {
					type: spec.fromVersionedType,
				},
				to: {
					type: spec.toVersionedType,
				},
			},
		};
	});

	const inKernelRelationshipsCount = ctx.kernel.getRelationships().length;

	const createdContracts = await Promise.all(
		relContracts.map((rc) =>
			ctx.kernel.insertContract(ctx.logContext, ctx.kernel.adminSession()!, rc),
		),
	);

	createdContracts.forEach((cc) => assert(cc !== null));

	// wait until all relationships are loaded into the kernel
	await ctx.retry(
		() => {
			return ctx.kernel.getRelationships();
		},
		(relationships: RelationshipContract[]) => {
			return (
				relationships.length >=
				createdContracts.length + inKernelRelationshipsCount
			);
		},
	);
}
