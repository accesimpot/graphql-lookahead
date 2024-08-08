import type { createSchema } from 'graphql-yoga'
import { mockFullCart } from '../mockData'

type Resolver = NonNullable<Parameters<typeof createSchema>[0]['resolvers']>

export const resolvers: Resolver = {
  Query: {
    order: (_parent, _args, _context, _info) => {
      // console.log(info.returnType)

      return mockFullCart
    },
  },
}
