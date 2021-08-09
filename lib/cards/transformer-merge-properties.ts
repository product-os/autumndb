/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

const isDraftVersion = '/^[^+]*-/.test(contract.version)';
const isFinalVersion = '!' + isDraftVersion;

export const mergeProperties = {
	// this.links."was built from".merged
	parentMerged: {
		description: 'parent contract was already merged',
		type: 'boolean',
		$$formula:
			'EVERY(contract.links["was built from"], "data.$transformer.merged") === true',
		readOnly: true,
		default: false,
	},

	// a type specific formula. May be "true" for the simplest case
	mergeable: {
		description: 'is ready to be merged as a final version',
		type: 'boolean',
		default: false,
	},

	// this.links."was merged as" exists
	merged: {
		description: 'was merged as a final version',
		type: 'boolean',
		$$formula: 'contract.links["was merged as"].length > 0',
		readOnly: true,
		default: false,
	},
	/*
		mergeConfirmed:
		if has no downstreams
			true
		else if isFinalVersion
			this.links.was merged from.mergeConfirmed
		else
			this.links.was built into.all(c => c.merged && c.mergeConfirmed)
	*/
	mergeConfirmed: {
		description: 'all downstream contracts are merged',
		type: 'boolean',
		$$formula: `(${isDraftVersion}
									&& EVERY(contract.links["was built into"], "data.$transformer.merged")
									&& EVERY(contract.links["was built into"], "data.$transformer.mergeConfirmed")
								) || (${isFinalVersion}
									&& PROPERTY(contract.links["was merged from"][0], "data.$transformer.mergeConfirmed") === true )`,
		readOnly: true,
	},

	finalVersion: {
		description:
			'this contract is a final version and not a SemVer pre-release',
		type: 'boolean',
		$$formula: isFinalVersion,
		readOnly: true,
	},

	artifactReady: {
		description: 'artifact is created',
		type: ['boolean', 'string'],
	},
};
