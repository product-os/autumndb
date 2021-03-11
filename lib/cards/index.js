/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

const {
	initialize
} = require('./mixins')

const cards = [
	require('./action-request'),
	require('./action'),
	require('./card'),
	require('./role'),
	require('./org'),
	require('./event'),
	require('./link'),
	require('./session'),
	require('./type'),
	require('./user-admin'),
	require('./user'),
	require('./role-user-admin'),
	require('./view'),
	require('./oauth-provider'),
	require('./oauth-client')
]

module.exports = cards.reduce((acc, card) => {
	const initializedCard = initialize(card)
	acc[initializedCard.slug] = initializedCard
	return acc
}, {})
