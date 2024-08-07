import type { createSchema } from 'graphql-yoga'

type Resolver = NonNullable<Parameters<typeof createSchema>[0]['resolvers']>

export const resolvers: Resolver = {
  Query: {
    order: (_parent, _args, _context, _info) => {
      // console.log(info.returnType)

      return {
        status: 'cart',
        items: [
          {
            product: {
              color: 'blue',
              size: 'M',
              inventory: {
                stock: 5,
              },
            },
            productGroup: {
              name: 'T-shirt with a truck',
              categories: ['apparel', 'top'],
            },
            price: 25,
            quantity: 1,
          },
        ],
        tax: 0,
        subtotal: 25,
        total: 25,
      }
    },
  },
}
