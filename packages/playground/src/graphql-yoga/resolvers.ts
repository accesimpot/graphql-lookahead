import type { createSchema } from 'graphql-yoga'
import { lookahead } from 'graphql-lookahead'
import { mockFullCart } from '../mockData'

type Resolver = NonNullable<Parameters<typeof createSchema>[0]['resolvers']>

interface QueryFilter {
  model?: string
  include?: (QueryFilter | string)[]
}

export const resolvers: Resolver = {
  Query: {
    order: (_parent, _args, context, info) => {
      const queryFilters: QueryFilter = {}

      lookahead({
        info,
        state: queryFilters,

        next({ state, typeName }) {
          const nextState: QueryFilter = { model: typeName }

          state.include = state.include || []
          state.include.push(nextState)

          return nextState
        },
      })

      // Will be picked up by `useMetaPlugin` to add "extensions.meta" to the final response
      context.request.metaData = { ...context.request.metaData, order: { queryFilters } }

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
      const queryFilters: QueryFilter = {}

      lookahead({
        info,
        state: queryFilters,

        next({ state, typeName }) {
          const nextState: QueryFilter = { model: typeName }

          state.include = state.include || []
          state.include.push(nextState)

          return nextState
        },
      })

      // Will be picked up by `useMetaPlugin` to add "extensions.meta" to the final response
      context.request.metaData = { ...context.request.metaData, productData: { queryFilters } }

      return [
        { ...mockFullCart.items[0].product, id: '34' },
        { ...mockFullCart.items[0].product, id: '36' },
      ]
    },
  },
}
