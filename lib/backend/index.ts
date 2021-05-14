/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import { defaultEnvironment as environment } from '@balena/jellyfish-environment';
import { PostgresBackend } from './postgres';

const backends = {
	postgres: PostgresBackend,
};

export const backend =
	backends[environment.database.type as keyof typeof backends];
