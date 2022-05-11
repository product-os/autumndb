export const relationshipOrgHasMemberUser = {
	slug: 'relationship-org-has-member-user',
	type: 'relationship@1.0.0',
	name: 'has member',
	data: {
		inverseName: 'is member of',
		title: 'Member',
		inverseTitle: 'Org',
		from: {
			type: 'org',
		},
		to: {
			type: 'user',
		},
	},
};
