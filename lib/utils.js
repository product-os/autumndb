/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

const _ = require('lodash')
const diff = require('deep-diff')

/**
 * Generate deep diff between two cards after applying a patch.
 * Using a third-party library to do the hard work, but converting the
 * results into something more generic that we can pass to multiple backends.
 *
 * @function
 *
 * @param {Object} before - card before applying patch
 * @param {Object} after - card after applying patch
 * @returns {Object} diff details, with concatenated paths as keys
 *
 * @example
 * exports.getPatchDiff(before, after)
 * // => {
 *   name: {
 *     type: 'update',
 *     value: 'bar'
 *   },
 *   'data.name': {
 *     type: 'update',
 *     value: 'baz'
 *   },
 *   ...
 * }
 */
exports.getPatchDiff = (before, after) => {
	const results = {}

	_.forEach(diff(before, after), (change) => {
		// Handle arrays in one go, instead of each element separately.
		const parentArrayPath = exports.getParentArray(after, change.path)
		const path = (_.isEmpty(parentArrayPath)) ? change.path : parentArrayPath

		// Create and return set of patch changes.
		const key = path.join('.')
		if (_.has(results, key)) {
			return
		}
		if (change.kind === 'D') {
			results[key] = {
				type: 'delete'
			}
		} else {
			results[key] = {
				type: (change.kind === 'N') ? 'add' : 'update',
				value: _.get(after, path)
			}
		}
	})

	return results
}

/**
 * Get and return the path of an elements uppermost parent array.
 * If the element does not exist within an array, return an empty array.
 *
 * @function
 *
 * @param {Object} object - card object in which the element exists
 * @param {Array} path - path of element to check
 * @returns {Array} path to uppermost parent array, empty if doesn't exist in array
 *
 * @example
 * exports.getParentArray(card, [ 'data', 'tags', 0 ])
 * // => [ 'data', 'tags' ]
 *
 * exports.getParentArray(card, [ 'data', 'tags' ])
 * // => []
 */
exports.getParentArray = (object, path) => {
	let result = []

	// Only worry about paths with numbers, as these
	// may be used to denote individual array elements.
	if (!_.isEmpty(_.filter(path, (element) => {
		return _.isNumber(element)
	}))) {
		const cursor = []
		for (let idx = 0; idx < path.length; idx++) {
			const part = path[idx]

			// Check each parent of number elements for being an array.
			if (_.isNumber(part) && _.isArray(_.get(object, cursor))) {
				result = cursor
				break
			}
			cursor.push(part)
		}
	}

	return result
}
