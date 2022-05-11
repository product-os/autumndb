export const relationshipOauthProviderHasAttachedOauthClient = {
	slug: 'relationship-oauth-provider-has-attached-oauth-client',
	type: 'relationship@1.0.0',
	name: 'has attached',
	data: {
		inverseName: 'is attached to',
		title: 'Oauth client',
		inverseTitle: 'Oauth provider',
		from: {
			type: 'oauth-provider',
		},
		to: {
			type: 'oauth-client',
		},
	},
};
