// This mixin contains numerous, often-used uiSchema fragments.
// Each fragment is generated with a function call, to ensure that
// We don't end up with any "mutation by reference" bugs.
const definitions = {
	reset: () => ({
		data: {
			'ui:title': null,
			'ui:options': {
				alignSelf: 'stretch',
			},
			origin: null,
			translateDate: null,
			$$localSchema: null,
		},
		id: null,
		name: null,
		slug: null,
		type: null,
		loop: null,
		version: null,
		markers: null,
		tags: null,
		links: null,
		linked_at: null,
		created_at: null,
		updated_at: null,
		active: null,
		requires: null,
		capabilities: null,
	}),
	repository: () => ({
		'ui:widget': 'Link',
		'ui:options': {
			blank: true,
			href: 'https://github.com/${source}',
		},
	}),
	time: () => ({
		'ui:options': {
			dtFormat: 'HH:mm',
		},
	}),
	date: () => ({
		'ui:options': {
			dtFormat: 'MMM do, yyyy',
		},
	}),
	dateTime: () => ({
		'ui:options': {
			dtFormat: 'MMM do, yyyy HH:mm',
		},
	}),
	email: () => ({
		'ui:widget': {
			$if: 'typeof(source) == "string"',
			then: 'Link',
			else: 'Array',
		},
		'ui:options': {
			href: {
				$if: 'typeof(source) == "string"',
				then: 'mailto:${source}',
				else: null,
			},
		},
		items: {
			'ui:widget': 'Link',
			'ui:options': {
				href: 'mailto:${source}',
			},
		},
	}),
	badgeList: () => ({
		items: {
			'ui:widget': 'Badge',
		},
	}),
	mirrors: () => ({
		items: {
			'ui:widget': 'Link',
			'ui:options': {
				blank: true,
				href: '${fns.getMirror(source)}',
			},
		},
	}),
	username: () => ({
		'ui:widget': 'JellyfishUser',
	}),
	userId: () => ({
		'ui:widget': 'JellyfishUser',
	}),
	usernameList: () => ({
		'ui:options': {
			orientation: 'horizontal',
		},
		items: {
			'ui:widget': 'JellyfishUser',
			'ui:options': {
				suffix: ',',
				mr: 1,
			},
		},
	}),
	userIdList: () => ({
		'ui:options': {
			orientation: 'horizontal',
		},
		items: {
			'ui:widget': 'JellyfishUser',
			'ui:options': {
				suffix: ',',
				mr: 1,
			},
		},
	}),
	groupList: () => ({
		'ui:widget': 'Txt',
	}),
	idOrSlugLink: () => ({
		'ui:widget': 'JellyfishLink',
		'ui:options': {
			href: 'https://jel.ly.fish/${source}',
		},
	}),
	idOrSlugList: () => ({
		items: definitions.idOrSlugLink(),
	}),
	externalUrl: () => ({
		'ui:widget': 'Link',
		'ui:options': {
			blank: true,
		},
	}),
};

export const uiSchemaDef = (key: keyof typeof definitions) => {
	return definitions[key]();
};
