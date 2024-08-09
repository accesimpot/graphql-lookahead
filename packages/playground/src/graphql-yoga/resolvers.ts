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

        next({ parentState, typeName }) {
          const nextState: QueryFilter = { model: typeName }

          parentState.include = parentState.include || []
          parentState.include.push(nextState)

          return nextState
        },
      })

      // Will be picked up by `useMetaPlugin` to add "extensions.meta" to the final response
      context.request.metaData = { ...context.request.metaData, queryFilters }

      return mockFullCart
    },
  },
}
