import path = require('path');
import { ContractDefinition } from './contract';
import { loadSchemaDefinitionFromFile } from './utils';

export const sensibleDefaults: ContractDefinition =
	loadSchemaDefinitionFromFile(
		path.join(__dirname, '../schemas/mixins/sensible-defaults.json'),
	);

export const baseUi: ContractDefinition = loadSchemaDefinitionFromFile(
	path.join(__dirname, '../schemas/mixins/ui-schema.json'),
);
