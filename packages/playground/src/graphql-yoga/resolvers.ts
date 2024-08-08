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
    order: (_parent, _args, _context, info) => {
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

      console.dir({ queryFilters }, { depth: null })

      // => {
      //   queryFilters: {
      //     include: [
      //       {
      //         model: 'OrderItem',
      //         include: [
      //           { model: 'Product', include: [ { model: 'Inventory' } ] },
      //           { model: 'ProductGroup' }
      //         ]
      //       }
      //     ]
      //   }
      // }

      return mockFullCart
    },
  },
}
