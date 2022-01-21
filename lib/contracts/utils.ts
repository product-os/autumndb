import * as path from 'path';
import * as fs from 'fs';

export const loadSchemaDefinitionFromFile = (file: string) => {
	return require(file);
};

export const loadSchemaDefinitionsFromDir = (
	dir: string,
	options: { exclude: string[] } = { exclude: [] },
) => {
	return fs
		.readdirSync(dir)
		.filter((file: string) => !options.exclude.find((el) => el === file))
		.map((file: string) => loadSchemaDefinitionFromFile(path.join(dir, file)));
};
