import { defaultEnvironment } from '@balena/jellyfish-environment';
import type { LogContext } from '@balena/jellyfish-logger';
import type {
	SessionContract,
	UserContract,
} from '@balena/jellyfish-types/build/core';
import { strict as assert } from 'assert';
import { Pool } from 'pg';
import { v4 as uuid } from 'uuid';
import { Cache } from './cache';
import { Kernel } from './kernel';

/**
 * Context that can be used in tests against the core.
 */
export interface TestContext {
	logContext: LogContext;
	session: string;
	cache: Cache;
	kernel: Kernel;
	pool: Pool;
	createUser: (
		username: string,
		hash?: string,
		roles?: string[],
	) => Promise<UserContract>;
	createSession: (user: UserContract) => Promise<SessionContract>;
}

/**
 * Create a new `TestContext` connected to a cache and the backend database.
 */
export const newContext = async (
	options: NewContextOptions = {},
): Promise<TestContext> => {
	const suffix = options.suffix || uuid();
	const dbName = `test_${suffix.replace(/-/g, '_')}`;

	const cache = new Cache(
		// TS-TODO: Fix this weird error about the "port" option
		Object.assign({}, defaultEnvironment.redis, { namespace: dbName } as any),
	);
	await cache.connect();

	const logContext = { id: `CORE-TEST-${uuid()}` };

	const { kernel, pool } = await Kernel.withPostgres(
		logContext,
		cache,
		Object.assign({}, defaultEnvironment.database.options, {
			database: dbName,
		}),
	);

	const createUser = async (
		username: string,
		hash = 'foobar',
		roles = ['user-community'],
	) => {
		// Create the user, only if it doesn't exist yet
		const userContract =
			(await kernel.getContractBySlug<UserContract>(
				logContext,
				kernel.adminSession()!,
				`user-${username}@latest`,
			)) ||
			(await kernel.insertContract<UserContract>(
				logContext,
				kernel.adminSession()!,
				{
					type: 'user@1.0.0',
					slug: `user-${username}`,
					data: {
						email: `${username}@example.com`,
						hash,
						roles,
					},
				},
			));
		assert(userContract);

		return userContract;
	};

	const createSession = async (user: UserContract) => {
		// Force login, even if we don't know the password
		const sessionContract = await kernel.insertContract<SessionContract>(
			logContext,
			kernel.adminSession()!,
			{
				slug: `session-${user.slug}-integration-tests-${generateRandomId()}`,
				type: 'session@1.0.0',
				data: {
					actor: user.id,
				},
			},
		);
		assert(sessionContract);

		return sessionContract;
	};

	return {
		logContext,
		session: kernel.adminSession()!,
		cache,
		kernel,
		pool,
		createUser,
		createSession,
	};
};

/**
 * Options accepted by `newContext`.
 */
export interface NewContextOptions {
	/**
	 * Use this suffix for the name of the test database. If not specified the
	 * suffix will be random.
	 */
	suffix?: string;
}

/**
 * Clear the test database and close all connections.
 */
export const destroyContext = async (context: TestContext) => {
	await context.kernel.drop(context.logContext);
	await context.kernel.disconnect(context.logContext);
	await context.cache.disconnect();
};

/**
 * Options accepted by `generateRandomSlug`.
 */
export interface RandomSlugOptions {
	/**
	 * Use this prefix for the slug. If not specified the slug will be random.
	 */
	prefix?: string;
}

/**
 * Generate a random contract ID.
 */
export const generateRandomId = (): string => {
	return uuid();
};

/**
 * Generate a random contract slug.
 */
export const generateRandomSlug = (options: RandomSlugOptions = {}): string => {
	const slug = generateRandomId();
	if (options.prefix) {
		return `${options.prefix}-${slug}`;
	}

	return slug;
};
