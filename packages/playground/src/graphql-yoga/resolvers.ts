import type { createSchema } from 'graphql-yoga'
// use relative import to use src files for test coverage
import { lookahead } from '../../../graphql-lookahead/src/index.js'
import { mockFullCart, mockPage } from '../mockData'

type Resolver = NonNullable<Parameters<typeof createSchema>[0]['resolvers']>

interface QueryFilter {
  model?: string
  include?: (QueryFilter | string)[]
}

export const resolvers: Resolver = {
  Query: {
    order: (_parent, _args, context, info) => {
      const hasQuantityFieldDepthOne = lookahead({
        info,
        until: ({ field }) => field === 'quantity',
        depth: 1,
      })
      const hasQuantityFieldDepthTwo = lookahead({
        info,
        until: ({ field }) => field === 'quantity',
        depth: 2,
      })
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

      // @ts-expect-error test invalid `next` option
      const invalidNext = lookahead({ info, next: 5 }) // returns true

      const invalidNextAndOnErrorReturningFalse = lookahead({
        info,
        // @ts-expect-error test invalid `next` option and `onError` returning false
        next: 'foo',
        onError: () => false,
      }) // returns false

      const invalidInfoNextAndOnErrorReturningUndefined = lookahead({
        // @ts-expect-error test invalid `info`
        info: undefined,
        // @ts-expect-error test invalid `next` and `onError` options
        next: 'foo',
        onError: () => undefined,
      }) // returns true

      const invalidInfoWithoutOnError = lookahead({
        // @ts-expect-error test invalid `info`
        info: undefined,
        until: ({ field }) => field === 'total',
      }) // returns true

      const noSelectionSetMatchingInfoPath = lookahead({
        info: {
          ...info,
          operation: {
            ...info.operation,
            selectionSet: {
              ...info.operation.selectionSet,
              selections: [],
            },
          },
        },
        until: ({ field }) => field === 'total',
      }) // returns false

      // Will be picked up by `useMetaPlugin` to add "extensions.meta" to the final response
      context.request.metaData = {
        ...context.request.metaData,
        'Query.order': {
          hasQuantityFieldDepthOne,
          hasQuantityFieldDepthTwo,
          invalidNext,
          invalidNextAndOnErrorReturningFalse,
          invalidInfoNextAndOnErrorReturningUndefined,
          invalidInfoWithoutOnError,
          noSelectionSetMatchingInfoPath,
          sequelizeQueryFilters,
        },
      }

      return mockFullCart
    },

    page: () => ({
      content: {
        get __typename() {
          return 'ProductPageContent'
        },
      },
    }),
  },

  ProductPageContent: {
    products: (_parent, _args, context, info) => {
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

      // Will be picked up by `useMetaPlugin` to add "extensions.meta" to the final response
      context.request.metaData = {
        ...context.request.metaData,
        'ProductPageContent.products': { sequelizeQueryFilters },
      }

      return mockPage.content.products
    },
  },

  Product: {
    inventory: (parent, _args, context, info) => {
      const hasIdField = lookahead({ info, until: ({ type }) => type === 'ID' })
      const hasStockField = lookahead({ info, until: ({ field }) => field === 'stock' })

      context.request.metaData = context.request.metaData || {}
      context.request.metaData['Product.inventory'] =
        context.request.metaData['Product.inventory'] || []
      context.request.metaData['Product.inventory'].push({ hasIdField, hasStockField })

      return parent.inventory
    },
  },
}
