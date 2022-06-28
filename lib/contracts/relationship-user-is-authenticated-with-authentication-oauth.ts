export const relationshipUserIsAuthenticatedWithAuthenticationOauth = {
	slug: 'relationship-user-is-authenticated-with-authentication-oauth',
	type: 'relationship@1.0.0',
	name: 'is authenticated with',
	data: {
		inverseName: 'authenticates',
		title: 'User',
		inverseTitle: 'Oauth authentication',
		from: {
			type: 'user',
		},
		to: {
			type: 'authentication-oauth',
		},
	},
};
