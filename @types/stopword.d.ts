/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

// TS-TODO: Contribute these type to the json-schema-deref-sync package
declare module 'stopword' {
	export function removeStopwords(
		tokens: string[],
		stopwords: string[],
	): string[];

	export const en: string[];
}
