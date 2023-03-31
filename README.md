<div align="center">
  <img width="400" height="auto" src="https://raw.githubusercontent.com/product-os/autumndb/master/autumnDB.png">
  <br>
  <br>

[![npm version](https://badge.fury.io/js/autumndb.svg)](https://badge.fury.io/js/autumndb)

  <p>
    JSON schema + Postgres.
  </p>
  <br>
  <br>
</div>

## Installation

Install by running:

```sh
npm install --save autumndb
```

## Usage

AutumnDB relies on Postgres v12+ and Redis v5+. The easiest way to get run these services is to use Docker via `docker-compose up`.

```js
import * as autumndb from "autumndb";

const start = async () => {
	// Create a unique logging context for the startup process
	const logContext = {
		id: `AUTUMN_DB_CONTEXT`,
	};

	// Instantiate the redis cache and connect to it
	const cache = new autumndb.Cache({
		mock: false,
		namespace: 'autumndb',
		url: 'redis://redis:6379',
		socket: {
			host: 'redis',
			port: 6379,
			tls: false
		},
	});
	await cache.connect();

	// Setup the kernel
	const { kernel } = await autumndb.Kernel.withPostgres(
		logContext,
		cache,
		backendOptions
		{
			host: 'localhost';
		}
	);

	// Create a new user
	const userCard = await kernel.replaceCard(
		logContext,
		kernel.adminSession(),
		{
			slug: 'user-test',
			type: 'user@1.0.0',
			name: 'Test User',
			data: {
				email: 'test@example.com',
				hash: 'PASSWORDLESS',
				roles: ['user-community'],
			},
		},
	);

	// Query for users using JSON Schema
	const results = await kernel.query(
		logContext,
		kernel.adminSession(),
		{
			type: 'object',
			properties: {
				type: {
					type: 'string',
					const: 'user@1.0.0'
				}
			}
		},
	);
};

start();
```

## Documentation

Visit the website for complete documentation: https://product-os.github.io/autumndb

## Features

AutumnDB provides the following features

### The contract data model

Every entity in the system is a data structure we call
a "contract". Contracts are an implementation of the [contracts data model](https://github.com/balena-io/balena/pull/1002).

Every contract has a `type` field that specifies type that the contract is an instance
of. Contract type definitions are indicated by having a `type` of `type`, e.g.

```
{
	"slug": "message",
	"type": "type",
	...
}
```

These "type" contracts contain model definitions in the form of a JSON schema. The
slug of a type contract is the value used in the type property of instances of the
type.
As an example, you can look at the [type contract for a "user"](https://github.com/product-os/autumndb/blob/master/lib/contracts/user.ts). You can see that under the `data` key, there is a `schema` value that defines the shape of a contract of type "message".
We follow the JSON schema spec, so if the schema allows, additional fields can
be added to a contract that are not defined in the type schema.

### JSON schema based querying

JSON schema is used to query the API, with any contracts that match the provided JSON
schema being returned in the result set.

### JSON patch

Contract updates are made using [JSON patch](http://jsonpatch.com/), allowing fine
grained updates to made to JSON data.

### User system

User contracts model the actors that interact with the system.
There are two default users, the admin And the guest. The admin user is typically used for system level operations or operations that require unrestricted access. The guest user represents an unauthorised user interacting with the system. Users authorize function calls using a session, which corresponds to the ID of a "session" contract in the system.
The data that a user has access to is defined using "role" contracts. All user contracts
define a list of roles that they have.

### Role based permissions

Every user in the system must have at least one role, which corresponds to a contract
of type "role". Role contracts contain a schema that defines which contracts the user
with that role can read and write.
When a query is made, the schemas in the user's roles are combined
with the user's query using an AND operator.
Additionally, roles can specify which fields should be returned by interpreting the use of
`additionalProperties: false` in JSON schemas. If `additionalProperties` is set
to false in a JSON schema, then only the defined properties in the schema will be returned.
When combined with role schemas, you can set permissions on a per-field basis.
For example, we can express that a user can view their password hash, but
not other user's.
This behaviour is based on the [AJV "removeAdditional" option](https://ajv.js.org/#filtering-data).

### Marker based permissions

The roles system is complemented by another permissions system called "markers".
Markers allow individual contracts to be restricted to one or more users. A marker
is a string that corresponds to either a user or organisation slug and they
appear as an array at the top level of a contract under the key `markers`.

```
{
	...
	"markers": [ "user-lucianbuzzo", "org-balena" ]
	...
}
```

To view a contract, a user must have access to all the markers on that contract. A user
has access to their marker (which is the slug of their user contract) and the
markers for each organisation they are a member of. Markers can also be in the
form of a compound marker, which is 2 or more markers concatenated with a `+`
symbol. A user has access to a contract with a compound marker if they have access
to at least one of the markers that make up the compound marker.
If a contract has no markers on it, then the contract is unrestricted by the markers system.

For example, if my user slug is `user-lucianbuzzo` and I am a member of the `org-balena` org, then I would be able to
view contracts with the markers:

- `[]` (i.e. no markers defined)
- `[ "org-balena", "user-lucianbuzzo" ]`
- `[ "user-lucianbuzzo" ]`
- `[ "org-balena+user-lucianbuzzo" ]`
- `[ "foobar+user-lucianbuzzo" ]`
- `[ "org-balena+user-foobar" ]`

However, I wouldn't be able to view contracts with the markers

- `[ "user-foobar" ]`
- `[ "user-foobar", "user-lucianbuzzo" ]`
- `[ "org-balena", "user-foobar" ]`
- `[ "org-balena", "user-foobar+user-bazbuzz" ]`

### Organisations

Users can belong to organisations.

### Streaming

A query can be streamed, creating an event emitter that will emit an event on any insert or update to a contract.

### Soft delete

When a contract is deleted, it is not removed from the database but has it's "active" field set to false. It is recommended that users should not be able to view inactive contracts.

### Rich logging

When a code path is run, a context object is passed through the call stack. Each context object has a unique ID that is used in log generation, allowing logs to be easily aggregated to observe codepaths.

### Built-in metric gathering

Measurable are gathered and observed using prometheus/grafana.

### Data relationships

Contracts can be linked together by creating a contract of type `link` that references both contracts and describes their relationship. Relationships can be traversed when querying data using the `$$links` syntax.

`Link` contracts are described by a [`relationship` contract](./lib/contracts/relationship.ts). Relationship contracts relate two contracts which are specified using the `from.type` and `to.type` properties, and describe two directions, from `from` to `to` using the `name` property, and from `to` to `from` using the `inverseName` property.

Example:

```ts
{
  slug: `relationship-message-is-attached-to-issue`,
  type: 'relationship@1.0.0',
  name: 'is attached to',
  data: {
  	inverseName: 'has attached element',
  	title: 'Message',
  	inverseTitle: 'Issue',
  	from: {
  		type: 'message',
  	},
  	to: {
  		type: 'issue',
  	},
  },
},
```

Note that `from.type` and `to.type` can refer to contracts by their slug ( `card` ) or if you want a more specific relationship they can refer to the versioned slug ( `card@1.0.0` ).

Relationships are bidirectional, `name` goes from `from` to `to` ( _{message} is attached to {issue}_ ), and `inverseName` goes from `to` to `from` ( _{issue} has attached element {message}_ ). Note that both directions have the same precedence; they're named `name` and `inverseName` for historical reasons but could've also been named `left` and `right`. Relationships contracts also have a `title` and `inverseTitle` property that can be used to describe the role of the `from` and `to` contracts.

All links ( contracts of type `link` ) created must be defined by a `relationship` contract or the link creation will be rejected with a `JellyfishUnknownRelationship` error. Client modules, for example `jellyfish-worker` create a set of "bootstrap" relationships on initialization.

### Caching

Requests for individual contracts by id or slug are cached, reducing DB load and improving query speed.

### Contract interface generation

TypeScript interfaces derived from contract definitions can be generated using the CLI:
```bash
npx autumndb generate-contract-interfaces
```

For more information:
```bash
npx autumndb --help
```

# Testing

Unit tests can be easily run with the command `npm test`.

You can run integration tests locally against Postgres and Redis instances running in `docker-compose`:
```bash
npm run compose
REDIS_HOST=localhost POSTGRES_HOST=localhost npx jest test/integration/permission-filter.spec.ts
```

You can also access these Postgres and Redis instances:
```bash
PGPASSWORD=docker psql -hlocalhost -Udocker
redis-cli -h localhost
```
