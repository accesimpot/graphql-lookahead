import type { createSchema } from 'graphql-yoga'
// use relative import to use src files for test coverage
import { lookahead } from '../../../graphql-lookahead/src'
import { callInvalidOrderLookaheads } from './testUtils'
import { mockFullCart, mockPage } from '../mockData'

type Resolver = NonNullable<Parameters<typeof createSchema>[0]['resolvers']>

interface QueryFilter {
  model?: string
  association?: string
  where?: object
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

        until({ sourceType, field }) {
          if (sourceType === 'Product' && field === 'color') {
            return {
              afterAllSelections() {
                context.request.metaData = {
                  ...context.request.metaData,
                  afterAllSelections: [
                    ...(context.request.metaData?.afterAllSelections || []),
                    { sourceType, field },
                  ],
                }
              },
            }
          }
          return false
        },
      })

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
        'Query.order': {
          returnValue: {
            hasQuantityFieldDepthOne,
            hasQuantityFieldDepthTwo,
            ...callInvalidOrderLookaheads(info),
          },
          sequelizeQueryFilters,
        },
      }

      return mockFullCart
    },

    page: (_parent, _args, context, info) => {
      const nestedFindOptions: QueryFilter = {}

      lookahead({
        info,
        state: nestedFindOptions,

        next({ state, args, field }) {
          const nextState: QueryFilter = { association: field }

          if (args.where && typeof args.where === 'object') nextState.where = args.where

          state.include = state.include || []
          state.include.push(nextState)

          return nextState
        },
      })

      // Will be picked up by `useMetaPlugin` to add "extensions.meta" to the final response
      context.request.metaData = {
        ...context.request.metaData,
        'Query.page': { nestedFindOptions },
      }

      lookahead({
        info,
        until: ({ field, isList }) => {
          if (isList) {
            Object.assign(context.request.metaData['Query.page'], { firstListFound: field })
            return true
          }
          return false
        },
      })

      return {
        content: {
          get __typename() {
            return 'ProductPageContent'
          },
        },
      }
    },
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
