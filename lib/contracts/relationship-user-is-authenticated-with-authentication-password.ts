export const relationshipUserIsAuthenticatedWithAuthenticationPassword = {
	slug: 'relationship-user-is-authenticated-with-authentication-password',
	type: 'relationship@1.0.0',
	name: 'is authenticated with',
	data: {
		inverseName: 'authenticates',
		title: 'User',
		inverseTitle: 'Password authentication',
		from: {
			type: 'user',
		},
		to: {
			type: 'authentication-password',
		},
	},
};
