import { defaultEnvironment as environment } from '@balena/jellyfish-environment';
import { PostgresBackend, PostgresBackendOptions } from './postgres';

const backends = {
	postgres: PostgresBackend,
};

export const defaultBackend =
	backends[environment.database.type as keyof typeof backends];

export { PostgresBackend, PostgresBackendOptions };
