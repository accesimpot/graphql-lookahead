import { vi, describe, it, expect } from 'vitest'
import type { ExecutionResult } from 'graphql'
import { createSchema, createYoga } from 'graphql-yoga'
import { buildHTTPExecutor } from '@graphql-tools/executor-http'
import { resolvers } from './resolvers'
import { typeDefs } from './typeDefs'
import { mockFullCart, mockPage } from '../mockData'
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

  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

  describe('when it sends full cart query', async () => {
    consoleErrorSpy.mockClear()
    const result = await execute({
      document: getFixtureQuery('graphql-yoga/queries/full-cart.gql'),
    })

    it('returns full cart data', () => {
      expect(result.data).toEqual({ order: mockFullCart })
    })

    it('has "hasQuantityFieldDepthOne" set to false in meta data', () => {
      expect(result.extensions?.meta?.['Query.order'].hasQuantityFieldDepthOne).toBe(false)
    })

    it('has "hasQuantityFieldDepthTwo" set to true in meta data', () => {
      expect(result.extensions?.meta?.['Query.order'].hasQuantityFieldDepthTwo).toBe(true)
    })

    it('has "invalidOnError" set to true in meta data', () => {
      expect(result.extensions?.meta?.['Query.order'].invalidOnError).toBe(true)
    })

    it('logs the runtime error instead of throwing', () => {
      expect(/[graphql-lookahead]/.test(consoleErrorSpy.mock.calls[0][0])).toBe(true)
      expect(consoleErrorSpy.mock.calls[0][1] instanceof Error).toBe(true)
      expect(/options.next is not a function/.test(consoleErrorSpy.mock.calls[0][1].message)).toBe(
        true
      )
    })

    it('has "invalidOnErrorAndReturnFalse" set to false in meta data', () => {
      expect(result.extensions?.meta?.['Query.order'].invalidOnErrorAndReturnFalse).toBe(false)
    })

    it('has fully nested query filters in meta data', () => {
      expect(result.extensions?.meta?.['Query.order'].sequelizeQueryFilters).toEqual({
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
      expect(result.extensions?.meta?.['Query.order'].sequelizeQueryFilters).toEqual({
        include: [
          {
            model: 'OrderItem',
            include: [{ model: 'ProductGroup' }],
          },
        ],
      })
    })
  })

  describe('when it sends full cart query and product page query with alias and fragments', async () => {
    describe('when lookahead is called within non-Query resolver', async () => {
      const result = await execute({
        document: getFixtureQuery('graphql-yoga/queries/cart-and-page.gql'),
      })

      it('returns full cart data with alias', () => {
        expect(result.data).toEqual({
          order: getMockFullCartWithProductGroupAlias(),
          page: mockPage,
        })
      })

      it('has only the deepest query filter in ProductPageContent meta data', () => {
        expect(
          result.extensions?.meta?.['ProductPageContent.products'].sequelizeQueryFilters
        ).toEqual({ include: [{ model: 'Inventory' }] })
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

function getMockFullCartWithProductGroupAlias() {
  const items = [] as (typeof mockFullCart)['items']

  mockFullCart.items.forEach(item => {
    const itemCopy = { ...item }
    // @ts-expect-error Not relevant in test
    itemCopy.group = itemCopy.productGroup
    // @ts-expect-error Not relevant in test
    delete itemCopy.productGroup
    items.push(itemCopy)
  })

  return { ...mockFullCart, items }
}
