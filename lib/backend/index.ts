import { defaultEnvironment as environment } from '@balena/jellyfish-environment';
import { PostgresBackend } from './postgres';

const backends = {
	postgres: PostgresBackend,
};

export const backend =
	backends[environment.database.type as keyof typeof backends];
