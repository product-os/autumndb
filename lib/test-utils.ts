import { defaultEnvironment } from '@balena/jellyfish-environment';
import type { LogContext } from '@balena/jellyfish-logger';
import { strict as assert } from 'assert';
import { Pool } from 'pg';
import { v4 as uuid } from 'uuid';
import { Cache } from './cache';
import { AutumnDBSession, Kernel } from './kernel';
import type {
	AuthenticationPasswordContract,
	Contract,
	LinkContract,
	OrgContract,
	SessionContract,
	UserContract,
} from './types';

/**
 * Context that can be used in tests against the core.
 */
export interface TestContext {
	logContext: LogContext;
	session: AutumnDBSession;
	cache: Cache;
	kernel: Kernel;
	pool: Pool;
	createOrg: (name: string) => Promise<OrgContract>;
	createUser: (
		username: string,
		hash?: string,
		roles?: string[],
	) => Promise<UserContract>;
	createSession: (user: UserContract) => Promise<SessionContract>;
	createLink: (
		fromCard: Contract,
		toCard: Contract,
		verb: string,
		inverseVerb: string,
	) => Promise<LinkContract>;
	retry: (
		fn: any,
		checkResult: any,
		times?: number,
		delay?: number,
	) => Promise<any>;
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

	const logContext: LogContext = { id: `CORE-TEST-${uuid()}` };

	const { kernel, pool } = await Kernel.withPostgres(
		logContext,
		cache,
		Object.assign({}, defaultEnvironment.database.options, {
			database: dbName,
		}),
	);

	const createOrg = async (name: string) => {
		const orgContract = await kernel.insertContract<OrgContract>(
			logContext,
			kernel.adminSession()!,
			{
				type: 'org@1.0.0',
				name,
			},
		);
		assert(orgContract);

		return orgContract;
	};

	const createUser = async (
		username: string,
		hash: string | undefined = undefined,
		roles = ['user-community'],
	) => {
		// Create the user, only if it doesn't exist yet
		let userContract = await kernel.getContractBySlug<UserContract>(
			logContext,
			kernel.adminSession()!,
			`user-${username}@latest`,
		);
		if (!userContract) {
			userContract = await kernel.insertContract<UserContract>(
				logContext,
				kernel.adminSession()!,
				{
					type: 'user@1.0.0',
					slug: `user-${username}`,
					data: {
						email: `${username}@example.com`,
						roles,
					},
				},
			);
			if (hash) {
				const passwordContract =
					await kernel.insertContract<AuthenticationPasswordContract>(
						logContext,
						kernel.adminSession()!,
						{
							type: 'authentication-password@1.0.0',
							slug: 'authentication-password-' + userContract.slug,
							data: {
								actorId: userContract.id,
								hash,
							},
						},
					);
				await kernel.insertContract<LinkContract>(
					logContext,
					kernel.adminSession()!,
					{
						slug: 'link-' + userContract.id + '-' + passwordContract.id,
						type: 'link@1.0.0',
						name: 'is authenticated with',
						created_at: userContract.created_at,
						markers: userContract.markers,
						data: {
							from: {
								id: userContract.id,
								type: 'user@1.0.0',
							},
							to: {
								id: passwordContract.id,
								type: 'authentication-password@1.0.0',
							},
							inverseName: 'authenticates',
						},
					},
				);
			}
		}
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

	const createLink = async (
		fromCard: Contract,
		toCard: Contract,
		verb: string,
		inverseVerb: string,
	) => {
		const linkContract = await kernel.insertContract<LinkContract>(
			logContext,
			kernel.adminSession()!,
			{
				type: 'link@1.0.0',
				slug: `link-${fromCard.id}-${verb.replace(/\s/g, '-')}-${
					toCard.id
				}-${generateRandomId()}`,
				version: '1.0.0',
				name: verb,
				data: {
					inverseName: inverseVerb,
					from: {
						id: fromCard.id,
						type: fromCard.type,
					},
					to: {
						id: toCard.id,
						type: toCard.type,
					},
				},
			},
		);
		assert(linkContract);

		return linkContract;
	};

	const retry = async (
		fn: any,
		checkResult: any,
		times = 10,
		delay = 500,
	): Promise<any> => {
		const result = await fn();
		if (!checkResult(result)) {
			if (times > 0) {
				await new Promise((resolve) => {
					setTimeout(resolve, delay);
				});
				return retry(fn, checkResult, times - 1);
			}
			throw new Error('Ran out of retry attempts');
		}
		return result;
	};

	return {
		logContext,
		session: kernel.adminSession()!,
		cache,
		kernel,
		pool,
		createOrg,
		createUser,
		createSession,
		createLink,
		retry,
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
