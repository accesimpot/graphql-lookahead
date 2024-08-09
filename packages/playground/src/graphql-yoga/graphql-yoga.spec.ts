import type { ExecutionResult } from 'graphql'
import { createSchema, createYoga } from 'graphql-yoga'
import { buildHTTPExecutor } from '@graphql-tools/executor-http'
import { resolvers } from './resolvers'
import { typeDefs } from './typeDefs'
import { mockFullCart } from '../mockData'
import { getFixtureQuery } from '../utils/graphql'
import { useMetaPlugin } from './plugins/useMetaPlugin'

describe('graphql-yoga', () => {
  const schema = createSchema({ typeDefs, resolvers })
  const yoga = createYoga({ schema, plugins: [useMetaPlugin()] })
  const executor = buildHTTPExecutor({ fetch: yoga.fetch })

  const execute = async (opts: Parameters<typeof executor>[0]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await executor(opts)) as ExecutionResult<any, { meta?: Record<string, any> }>
  }

  describe('when it sends full cart query', async () => {
    const result = await execute({
      document: getFixtureQuery('graphql-yoga/queries/full-cart.gql'),
    })

    it('returns full cart data', () => {
      expect(result.data).toEqual({ order: mockFullCart })
    })

    it('has fully nested query filters in meta data', () => {
      expect(result.extensions?.meta?.queryFilters).toEqual({
        include: [
          {
            model: 'OrderItem',
            include: [
              { model: 'Product', include: [{ model: 'Inventory' }] },
              { model: 'ProductGroup' },
            ],
          },
        ],
      })
    })
  })

  describe('when it sends partial cart query', async () => {
    const result = await execute({
      document: getFixtureQuery('graphql-yoga/queries/partial-cart.gql'),
    })

    it('returns partial cart data', () => {
      expect(result.data).toEqual({ order: getMockPartialCart() })
    })

    it('has partial query filters in meta data', () => {
      expect(result.extensions?.meta?.queryFilters).toEqual({
        include: [
          {
            model: 'OrderItem',
            include: [{ model: 'ProductGroup' }],
          },
        ],
      })
    })
  })
})

function getMockPartialCart() {
  const items = [] as (typeof mockFullCart)['items']

  mockFullCart.items.forEach(item => {
    const itemCopy = { ...item }
    // @ts-expect-error Not relevant in test
    delete itemCopy.product
    items.push(itemCopy)
  })

  return { ...mockFullCart, items }
}
