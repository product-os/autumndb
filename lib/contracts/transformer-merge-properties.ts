const isDraftVersion = '/^[^+]*-/.test(contract.version)';
const isFinalVersion = '!' + isDraftVersion;

export const mergeProperties = {
	// used to enforce triggered action re-creation after bug-fixes in the formula engine
	formulaVersion: {
		type: 'number',
		$$formula: '2',
		readOnly: true,
		default: 0,
	},

	// this.links."was built from".merged
	parentMerged: {
		description: 'parent contract was already merged',
		type: 'boolean',
		$$formula:
			'contract.links["was built from"].length > 0 && EVERY(contract.links["was built from"], "data.$transformer.merged") === true',
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
