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
        'Query.order': { sequelizeQueryFilters },
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
}
