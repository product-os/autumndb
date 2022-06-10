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
