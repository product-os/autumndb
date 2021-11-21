// TS-TODO: Contribute these type to the json-schema-deref-sync package
declare module 'stopword' {
	export function removeStopwords(
		tokens: string[],
		stopwords: string[],
	): string[];

	export const en: string[];
}
