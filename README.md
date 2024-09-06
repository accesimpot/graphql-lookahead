# GraphQL Lookahead in Javascript

[![TypeScript][typescript-src]][typescript-href]
[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]

Use `graphql-lookahead` to check within the resolver function if particular fields are part of the operation (query or mutation).

<br>

❤️ Provided by [Accès Impôt](https://www.acces-impot.com)'s engineering team

| <a href="https://www.acces-impot.com" target="_blank"><img width="338" alt="Accès Impôt" src="https://github.com/user-attachments/assets/79aa6364-51d1-4482-b31e-680568d647f0"></a> |
| :---: |
| 🇨🇦 _Online tax declaration service_ 🇨🇦 |

<br>

## Table of contents

- [Highlights](#highlights)
- [Quick Setup](#quick-setup)
- [Basic usage](#basic-usage)
  - [Types](#types)
  - [Options](#options)
- [Advanced usage](#advanced-usage)
  - [Example: Sequelize with nested query filters](#example-sequelize-with-nested-query-filters)
  - [More examples in integration tests](#more-examples-in-integration-tests)
- [Playground](#playground)
- [Contribution](#contribution)

<br>

## Highlights

- ⚡️ Performant - Avoid querying nested database relationships if they are not requested.
- 🎯 Accurate - Check for the `field` or `type`  name. Check for a specific hierarchy of fields.
- 🧘 Flexible - Works with any ORM, query builder, GraphQL servers.
- 💪 Reliable - Covered by integration tests.
- 🏀 Accessible - Clone this repository and try it out locally using the playground.

<br>

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

<br>

## Basic usage

You can add a condition using the `until` option which will be called for every nested field within the operation starting from the resolver field.

```ts
import type { createSchema } from 'graphql-yoga'
import { lookahead } from 'graphql-lookahead'

type Resolver = NonNullable<Parameters<typeof createSchema>[0]['resolvers']>

export const resolvers: Resolver = {
  Query: {
    order: async (_parent, args, _context, info) => {
      //
      // add your condition

      if (lookahead({ info, until: ({ field }) => field === 'product' })) {
        // include product in the query
      }
      // ...
    },
  },
}
```

<br>

### Types

```ts
import type { GraphQLResolveInfo, SelectionNode } from 'graphql'

function lookahead<TState, RError extends boolean | undefined>(options: {
  depth?: number | null
  info: Pick<
    GraphQLResolveInfo,
    'operation' | 'schema' | 'fragments' | 'returnType' | 'fieldNodes' | 'fieldName'
  >
  next?: (details: NextHandlerDetails<TState>) => TState
  onError?: (err: unknown) => RError
  state?: TState
  until?: (details: UntilHandlerDetails<TState>) => boolean
}): boolean

type HandlerDetails<TState> = {
  field: string
  selection: SelectionNode
  state: TState
  type: string
}

type UntilHandlerDetails<TState> = HandlerDetails<TState> & {
  nextSelectionSet?: SelectionSetNode
}

type NextHandlerDetails<TState> = HandlerDetails<TState> & {
  nextSelectionSet: SelectionSetNode
}
```

<br>

### Options

| Name | Description |
| ------ | :---------- |
| `depth` | ❔ _Optional_ - Specify how deep it should look in the `selectionSet` (i.e. `depth: 1` is the initial `selectionSet`, `depth: null` is no limit). Default: `depth: null`. |
| `info` | ❗️ _Required_ - GraphQLResolveInfo object which is usually the fourth argument of the resolver function. |
| `next` | ❔ _Optional_ - Handler called for every nested field within the operation. It can return a state that will be passed to each `next` call of its direct child fields. See [Advanced usage](#advanced-usage). |
| `onError` | ❔ _Optional_ - Hook called from a `try..catch` when an error is caught. Default: `(err: unknown) => { console.error(ERROR_PREFIX, err); return true }`. |
| `state` | ❔ _Optional_ - Initial state used in `next` handler. See [Advanced usage](#advanced-usage).|
| `until` | ❔ _Optional_ - Handler called for every nested field within the operation. Returning true will stop the iteration and make `lookahead` return true as well. |

<br>

## Advanced usage

You can pass a `state` and use the `next` option that will be called for every nested field within the operation. It is similar to `until`, but `next` can mutate the parent state and return the next state that will be passed to its child fields. You will still need the `until` option if you want to stop the iteration at some point (optional).

If your schema matches your database models, you could build the query filters like this:

<br>

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

        next({ state, type }) {
          const nextState: QueryFilter = { model: type }

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

<br>

### More examples in integration tests

- See [graphql-yoga](packages/playground/src/graphql-yoga) directory

<br>

## Playground

You can play around with `lookahead` and our mock schema by cloning this repository and running the `dev` script locally (requires [pnpm](https://pnpm.io/installation)).

```bash
pnpm install
pnpm dev
```

Visit the playground at http://localhost:4455/graphql 🚀

<img width="1440" alt="image" src="https://github.com/user-attachments/assets/924a6e88-abb5-4f66-a822-cae93bc34061">

<br>
<br>
<br>

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

  # Run Vitest in watch mode
  pnpm test:watch
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
