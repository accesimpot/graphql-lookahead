# GraphQL Lookahead in Javascript

[![TypeScript][typescript-src]][typescript-href]
[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]

Use `graphql-lookahead` to check within the resolver function if particular fields are part of the operation (`info.operation`). This allows you to avoid querying nested database relationships if they are not requested.

- [Features](#features)
- [Quick Setup](#quick-setup)
- [Basic usage](#basic-usage)
  - [Types](#types)
  - [Options](#options)
- [Advanced usage](#advanced-usage)
  - [Example: Sequelize with nested query filters](#example-sequelize-with-nested-query-filters)
- [Contribution](#contribution)

## Features

- ⛰ &nbsp;Foo
- 🚠 &nbsp;Bar
- 🌲 &nbsp;Baz

## Quick Setup

Install the module:

```bash
# pnpm
pnpm add graphql-lookahead

# yarn
yarn add graphql-lookahead

# npm
npm i graphql-lookahead
```

## Basic usage

You can add a condition using the `until` option which will be called for every nested field within the operation starting from the field of the resolver that runs the check.

```ts
import type { createSchema } from 'graphql-yoga'
import { lookahead } from 'graphql-lookahead'

type Resolver = NonNullable<Parameters<typeof createSchema>[0]['resolvers']>

export const resolvers: Resolver = {
  Query: {
    order: async (_parent, args, _context, info) => {
      //
      // add your condition

      if (lookahead({ info, until: ({ fieldName }) => fieldName === 'product' })) {
        // then do something
      }
      // ...
    },
  },
}
```

### Types

```ts
import type { GraphQLResolveInfo, SelectionSetNode } from 'graphql'

function lookahead<TState>(options: {
  info: Pick<GraphQLResolveInfo, 'operation' | 'schema' | 'returnType' | 'path'>
  next?: (details: HandlerDetails<TState>) => TState
  state?: TState
  until?: (details: HandlerDetails<TState>) => boolean
}): boolean

type HandlerDetails<TState> = {
  fieldName: string
  selectionSet: SelectionSetNode
  state: TState
  typeName: string
}
```

### Options

| name | description |
| ------ | ----------- |
| `info` | ❗️ _Required_ - GraphQLResolveInfo object which is usually the fourth argument of the resolver function. |
| `next` | ❔ _Optional_ - Handler called for every nested field within the operation. It can return a state that will be passed to each `next` call of its direct child fields. See [Advanced usage](#advanced-usage). |
| `state` | ❔ _Optional_ - Initial state used in `next` handler. See [Advanced usage](#advanced-usage).|
| `until` | ❔ _Optional_ - Handler called for every nested field within the operation. Returning true will stop the iteration and make `lookahead` return true as well. |

## Advanced usage

You can pass a `state` and use the `next` option that will be called for every nested field within the operation. It is similar to `until`, but `next` can mutate the parent state and return the next state that will be passed to its child fields. You will still need the `until` option if you want to stop the iteration at some point (optional).

If your schema matches your database models, you could build the query filters like this:

### Example: Sequelize with nested query filters

📚 [Sequelize ORM](https://sequelize.org/)

- Sequelize documentation: [Multiple eager loading](https://sequelize.org/docs/v6/advanced-association-concepts/eager-loading/#multiple-eager-loading)
- Stackoverflow: [Nested include in sequelize?](https://stackoverflow.com/a/72222005/1895428)

```ts
import type { createSchema } from 'graphql-yoga'
import { lookahead } from 'graphql-lookahead'

type Resolver = NonNullable<Parameters<typeof createSchema>[0]['resolvers']>

interface QueryFilter {
  model?: string
  include?: (QueryFilter | string)[]
}

export const resolvers: Resolver = {
  Query: {
    order: async (_parent, args, _context, info) => {
      const sequelizeQueryFilters: QueryFilter = {}

      lookahead({
        info,
        state: sequelizeQueryFilters,

        next({ state, typeName }) {
          const nextState: QueryFilter = { model: typeName }

          state.include = state.include || []
          state.include.push(nextState)

          return nextState
        },
      })

      /**
       * `sequelizeQueryFilters` now equals to
       * {
       *   include: [
       *     {
       *       model: 'OrderItem',
       *       include: [
       *         { model: 'Product', include: [{ model: 'Inventory' }] },
       *         { model: 'ProductGroup' },
       *       ],
       *     },
       *   ],
       * }
       *
       * or would be without the `ProductGroup` filter if the operation didn't include it
       */

      return await Order.findOne(sequelizeQueryFilters)
    },
  },
}
```

## Contribution

<details>
  <summary>Local development</summary>
  
  ```bash
  # Install dependencies
  pnpm install

  # Develop using the playground
  pnpm dev

  # Run ESLint
  pnpm lint

  # Run Vitest
  pnpm test

  # Release new version
  pnpm release
  ```
</details>

<!-- Badges -->

[typescript-src]: https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg
[typescript-href]: http://www.typescriptlang.org/
[npm-version-src]: https://img.shields.io/npm/v/graphql-lookahead/latest.svg?style=flat&colorA=020420&colorB=00DC82
[npm-version-href]: https://npmjs.com/package/graphql-lookahead
[npm-downloads-src]: https://img.shields.io/npm/dm/graphql-lookahead.svg?style=flat&colorA=020420&colorB=00DC82
[npm-downloads-href]: https://npmjs.com/package/graphql-lookahead
[license-src]: https://img.shields.io/npm/l/graphql-lookahead.svg?style=flat&colorA=020420&colorB=00DC82
[license-href]: https://npmjs.com/package/graphql-lookahead
