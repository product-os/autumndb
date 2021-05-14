/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

// TS-TODO: Contribute these type to the json-schema-deref-sync package
declare module 'json-schema-deref-sync' {
	import { JSONSchema } from '@balena/jellyfish-types';

	/**
	 * Derefs <code>$ref</code>'s in JSON Schema to actual resolved values. Supports local, and file refs.
	 * @param {Object} schema - The JSON schema
	 * @param {Object} options - options
	 * @param {String} options.baseFolder - the base folder to get relative path files from. Default is <code>process.cwd()</code>
	 * @param {Boolean} options.failOnMissing - By default missing / unresolved refs will be left as is with their ref value intact.
	 *                                        If set to <code>true</code> we will error out on first missing ref that we cannot
	 *                                        resolve. Default: <code>false</code>.
	 * @param {Boolean} options.mergeAdditionalProperties - By default properties in a object with $ref will be removed in the output.
	 *                                                    If set to <code>true</code> they will be added/overwrite the output. This will use lodash's merge function.
	 *                                                    Default: <code>false</code>.
	 * @param {Boolean} options.removeIds - By default <code>$id</code> fields will get copied when dereferencing.
	 *                                    If set to <code>true</code> they will be removed. Merged properties will not get removed.
	 *                                    Default: <code>false</code>.
	 * @param {Object} options.loaders - A hash mapping reference types (e.g., 'file') to loader functions.
	 * @return {Object|Error} the deref schema oran instance of <code>Error</code> if error.
	 */
	declare function deref(
		schema: JSONSchema,
		options: {
			baseFolder?: string;
			failOnMissing?: boolean;
			mergeAdditionalProperties?: boolean;
			removeIds?: boolean;
			loaders?: { [key: string]: any };
		},
	): JSONSchema;

	export = deref;
}
