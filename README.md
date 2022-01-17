# Jellyfish Core

The Jellyfish core is a low-level internal SDK to interact with contracts in the
database, providing functions like `.getContractById()` or `.insertContract()`. The
core provides the foundation library for the rest of system.

## Goals

- The core aims to expose a small and simple interface
- The core aims to **not** expose any details about the underlying database
  implementations
- The core aims for correctness and speed
- The core aims to be the only module in the system that directly interacts
  with the database

## Features

The Jellyfish core provides the following features

### The contract data model

Every entity in the system is a data structure we call
a "contract". Contracts are an implementation of the [contracts data model](https://github.com/balena-io/balena/pull/1002).

Every contract has a `type` field that specifies type that the contract is an instance
of. Contract type definitions are indicated by having a `type` of `type`, e.g.

```json
{
	"slug": "message",
	"type": "type",
	...
}
```

These "type" contracts contain model definitions in the form of a JSON schema. The
slug of a type contract is the value used in the type property of instances of the
type.
As an example, you can look at the [type contract for a "message"](https://github.com/product-os/jellyfish-plugin-default/blob/master/lib/contracts/contrib/message.json). You can see that under the `data` key, there is a `schema` value that defines the shape of a contract of type "message".
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

```json
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

Contracts can be linked together by creating a contract of type "link" that references both contracts and describes their relationship. Relationships can be traversed when querying data using the `$$links` syntax.

### Caching

Requests for individual contracts by id or slug are cached, reducing DB load and
improving query speed.
This library contains email integration functionality for use in Jellyfish.

## Usage

Below is an example how to use this library:

```js
import { MemoryCache, create } from '@balena/jellyfish-core';

const cache = new core.MemoryCache(environment.redis);
const jellyfish = await create(context, cache, {
	backend: environment.database.options,
});
```

# Testing

Unit tests can be easily run with the command `npm test`.

The integration tests require Postgres and Redis instances. The simplest way to run the tests locally is with `docker-compose`.

```
$ npm run test:compose
```

You can also run tests locally against Postgres and Redis instances running in `docker-compose`:
```
$ npm run compose
$ REDIS_HOST=localhost POSTGRES_HOST=localhost npx jest test/integration/permission-filter.spec.ts
```

You can also access these Postgres and Redis instances:
```
$ PGPASSWORD=docker psql -hlocalhost -Udocker
$ redis-cli -h localhost
```
