import * as _ from 'lodash';
import { CONTRACTS } from './contracts';
import type { JsonSchema, ViewContract } from './types';
import { getViewContractSchema } from './views';

// TODO: make name more descriptive
export const preprocessQuerySchema = async (
	schema: JsonSchema | ViewContract,
): Promise<JsonSchema> => {
	if (
		schema instanceof Object &&
		schema.type === `${CONTRACTS['view'].slug}@${CONTRACTS['view'].version}`
	) {
		schema = getViewContractSchema(schema as ViewContract)!;
	}

	return schema as JsonSchema;
};

export const getSchemaTypes = (schema: JsonSchema): string[] => {
	let linkSchemaTypes = [];
	if (typeof schema !== 'boolean') {
		if (_.has(schema, ['properties', 'type', 'const'])) {
			linkSchemaTypes = [(schema.properties!.type as any).const.split('@')[0]];
		} else if (_.has(schema, ['properties', 'type', 'enum'])) {
			const deversionedTypes = (schema.properties!.type as any).enum.map(
				(typeName: string) => {
					return typeName.split('@')[0];
				},
			);
			linkSchemaTypes = deversionedTypes;
		} else if (_.has(schema, ['properties', 'type', 'anyOf'])) {
			const deversionedTypes = (schema.properties!.type as any).anyOf.map(
				(subSchema: JsonSchema) => {
					return typeof subSchema === 'boolean'
						? null
						: (subSchema?.const as string).split('@')[0];
				},
			);
			linkSchemaTypes = _.compact(deversionedTypes);
		}
	}

	return linkSchemaTypes;
};
