# GraphQL Lookahead in Javascript

[![TypeScript][typescript-src]][typescript-href]
[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]

Use `graphql-lookahead` to check within the resolver function if particular fields are part of the operation (query or mutation). Use `lookbehind` to walk the other direction and inspect **parent** fields on the resolve path.

<br>

❤️ Provided by [Elio Tax](https://www.elio-tax.com?utm_source=github&utm_medium=referral&utm_campaign=graphql-lookahead-readme)'s engineering team

| <a href="https://www.elio-tax.com?utm_source=github&utm_medium=referral&utm_campaign=graphql-lookahead-readme" target="_blank"><img width="265" alt="Elio Tax" src="https://github.com/user-attachments/assets/b3ae1fcb-2242-4e68-a36e-671fe39c1174"></a> |
| :---: |
| 🇨🇦 _Online tax filing service_ 🇨🇦 |

<br>

## Table of contents

- [Highlights](#highlights)
- [Quick Setup](#quick-setup)
- [Basic usage](#basic-usage)
  - [Types](#types)
  - [Options](#options)
- [Looking behind (parent fields)](#looking-behind-parent-fields)
  - [Types (`lookbehind`)](#types-lookbehind)
  - [Options (`lookbehind`)](#options-lookbehind)
- [Advanced usage](#advanced-usage)
  - [Example: Sequelize with nested query filters](#example-sequelize-with-nested-query-filters)
  - [Fragment selections (`nextFragment`)](#fragment-selections-nextfragment)
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
function lookahead<TState, RError extends boolean | undefined>(options: {
  depth?: number | null
  info: GraphQLResolveInfo
  next?: (details: NextHandlerDetails<TState>) => TState
  nextFragment?: (details: NextFragmentHandlerDetails<TState>) => TState
  onError?: (err: unknown) => RError
  state?: TState
  until?: (details: UntilHandlerDetails<TState>) => boolean
}): boolean

type HandlerDetailsBase<TState> = {
  info: GraphQLResolveInfo
  sourceType: string
  state: TState
  type: string
}

type HandlerDetails<TState> = HandlerDetailsBase<TState> & {
  args: { [arg: string]: unknown }
  field: string
  fieldDef: GraphQLField
  isList: boolean
  selection: FieldNode
}

type UntilHandlerDetails<TState> = HandlerDetails<TState> & {
  nextSelectionSet?: SelectionSetNode
}

type NextHandlerDetails<TState> = HandlerDetails<TState> & {
  nextSelectionSet: SelectionSetNode
}

type NextFragmentHandlerDetails<TState> = HandlerDetailsBase<TState> & {
  nextSelectionSet: SelectionSetNode
  selection: FragmentSpreadNode | InlineFragmentNode
}
```

<br>

### Options

| Name | Description |
| ------ | :---------- |
| `depth` | ❔ _Optional_ - Specify how deep it should look in the `selectionSet` (i.e. `depth: 1` is the initial `selectionSet`, `depth: null` is no limit). Default: `depth: null`. |
| `info` | ❗️ _Required_ - GraphQLResolveInfo object which is usually the fourth argument of the resolver function. |
| `next` | ❔ _Optional_ - Handler called for every field with subfields within the operation. It can return a state that will be passed to each `next` call of its direct child fields. See [Advanced usage](#advanced-usage). |
| `nextFragment` | ❔ _Optional_ - Handler called for fragment selections (`next` is only called for field selections). See [Advanced usage](#fragment-selections-nextfragment). |
| `onError` | ❔ _Optional_ - Hook called from a `try..catch` when an error is caught. Default: `(err: unknown) => { console.error(ERROR_PREFIX, err); return true }`. |
| `state` | ❔ _Optional_ - Initial state passed to `next` and `nextFragment` (and their nested calls). See [Advanced usage](#advanced-usage). |
| `until` | ❔ _Optional_ - Handler called for every nested field within the operation. Returning true will stop the iteration and make `lookahead` return true as well. |

<br>

## Looking behind (parent fields)

`lookbehind` is the inverse of `lookahead`: instead of inspecting child selections in the operation, it walks **ancestor** fields via `info.path`.

It starts at `info.path.prev` (the immediate parent), not the current resolver field — symmetric with `lookahead`, which starts at child fields rather than the resolver field itself.

```ts
import type { createSchema } from 'graphql-yoga'
import { lookbehind } from 'graphql-lookahead'

type Resolver = NonNullable<Parameters<typeof createSchema>[0]['resolvers']>

export const resolvers: Resolver = {
  Product: {
    sku: async (_parent, _args, _context, info) => {
      // true when resolving under `order { item { product { sku } } }`
      if (lookbehind({ info, until: ({ field }) => field === 'order' })) {
        // ...
      }

      // Only check the immediate parent
      lookbehind({
        info,
        depth: 1,
        until: ({ field, sourceType, listIndex }) => {
          console.log(field, sourceType, listIndex)
          return false
        },
      })

      return 'SKU-1'
    },
  },
}
```

Fragments do **not** appear as path steps (GraphQL’s resolve path only contains response keys and list indices). Resolvers nested inside inline fragments or fragment spreads still see the correct parent field chain.

Aliases are supported: handlers receive the schema field name as `field`, and the response key as `responseKey` (same value when there is no alias). When the same alias appears under multiple union/interface fragments, `lookbehind` uses the runtime parent type (`path.typename`) to pick the matching branch.

<br>

### Types (`lookbehind`)

```ts
function lookbehind<TState, RError extends boolean | undefined>(options: {
  depth?: number | null
  info: GraphQLResolveInfo
  next?: (details: PrevHandlerDetails<TState>) => TState
  onError?: (err: unknown) => RError
  state?: TState
  until?: (details: UntilPrevHandlerDetails<TState>) => boolean | {
    afterAllParents: (details: UntilPrevHandlerDetails<TState>) => void
  }
}): boolean

type PrevHandlerDetails<TState> = {
  info: GraphQLResolveInfo
  field: string
  fieldDef: GraphQLField
  isList: boolean
  listIndex?: number
  path: ResolvePath
  responseKey: string
  sourceType: string
  state: TState
  type: string
}
```

`lookHigher` is also exported when you need to start from an arbitrary `info.path` step instead of `info.path.prev`.

<br>

### Options (`lookbehind`)

| Name | Description |
| ------ | :---------- |
| `depth` | ❔ _Optional_ - How many parent fields to visit (`depth: 1` is the immediate parent, `depth: null` is no limit). Default: `depth: null`. |
| `info` | ❗️ _Required_ - GraphQLResolveInfo object which is usually the fourth argument of the resolver function. |
| `next` | ❔ _Optional_ - Handler called for every ancestor field. It can return a state that will be passed to the next (higher) parent’s handlers. |
| `onError` | ❔ _Optional_ - Hook called from a `try..catch` when an error is caught. Default: `(err: unknown) => { console.error(ERROR_PREFIX, err); return true }`. |
| `state` | ❔ _Optional_ - Initial state passed to `next` (and nested upward calls). |
| `until` | ❔ _Optional_ - Handler called for every ancestor field. Returning true will stop the iteration and make `lookbehind` return true as well. |

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

### Fragment selections (`nextFragment`)

For each fragment step in the operation (`... on Type { }` or `...FragmentName`), `lookahead` calls `nextFragment` instead of `next`. It has the same `state` and return contract as `next` for nested handlers.

Inline fragments without a type condition (e.g. `... @include(if: true) { }`) do _not_ invoke `nextFragment` (or `next` / `until` for that node). The walker still descends into their selection set using the parent GraphQL type and the current `state`.

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
