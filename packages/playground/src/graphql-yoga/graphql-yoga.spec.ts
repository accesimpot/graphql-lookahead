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
      expect(result.data).toEqual({ order: { ...mockFullCart, invalidField: null } })
    })

    it('has "hasQuantityFieldDepthOne" set to false in meta data', () => {
      expect(result.extensions?.meta?.['Query.order'].returnValue.hasQuantityFieldDepthOne).toBe(
        false
      )
    })

    it('has "hasQuantityFieldDepthTwo" set to true in meta data', () => {
      expect(result.extensions?.meta?.['Query.order'].returnValue.hasQuantityFieldDepthTwo).toBe(
        true
      )
    })

    it('has "invalidNext" set to true in meta data', () => {
      expect(result.extensions?.meta?.['Query.order'].returnValue.invalidNext).toBe(true)
    })

    it('logs the runtime error instead of throwing', () => {
      expect(/[graphql-lookahead]/.test(consoleErrorSpy.mock.calls[0][0])).toBe(true)
      expect(consoleErrorSpy.mock.calls[0][1] instanceof Error).toBe(true)
      expect(/options.next is not a function/.test(consoleErrorSpy.mock.calls[0][1].message)).toBe(
        true
      )
    })

    it('has "invalidNextAndOnErrorReturningFalse" set to true in meta data', () => {
      expect(
        result.extensions?.meta?.['Query.order'].returnValue.invalidNextAndOnErrorReturningFalse
      ).toBe(false)
    })

    it('has "invalidNextAndOnErrorReturningUndefined" set to true in meta data', () => {
      expect(
        result.extensions?.meta?.['Query.order'].returnValue.invalidNextAndOnErrorReturningUndefined
      ).toBe(true)
    })

    it('has "invalidInfoNextAndOnErrorReturningUndefined" set to true in meta data', () => {
      expect(
        result.extensions?.meta?.['Query.order'].returnValue
          .invalidInfoNextAndOnErrorReturningUndefined
      ).toBe(true)
    })

    it('has "invalidInfoWithoutOnError" set to true in meta data', () => {
      expect(result.extensions?.meta?.['Query.order'].returnValue.invalidInfoWithoutOnError).toBe(
        true
      )
    })

    it('has "invalidInfoAndOnErrorReturningFalse" set to false in meta data', () => {
      expect(
        result.extensions?.meta?.['Query.order'].returnValue.invalidInfoAndOnErrorReturningFalse
      ).toBe(false)
    })

    it('has "invalidInfoAndOnErrorReturningUndefined" set to true in meta data', () => {
      expect(
        result.extensions?.meta?.['Query.order'].returnValue.invalidInfoAndOnErrorReturningUndefined
      ).toBe(true)
    })

    it('has "invalidInfoReturnType" set to true in meta data', () => {
      expect(result.extensions?.meta?.['Query.order'].returnValue.invalidInfoReturnType).toBe(true)
    })

    it('has "invalidSelectionName" set to true in meta data', () => {
      expect(result.extensions?.meta?.['Query.order'].returnValue.invalidSelectionName).toBe(true)
    })

    it('has "noSelectionSetMatchingInfoPath" set to true in meta data', () => {
      expect(
        result.extensions?.meta?.['Query.order'].returnValue.noSelectionSetMatchingInfoPath
      ).toBe(true)
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
    const color = 'blue'
    const result = await execute({
      document: getFixtureQuery('graphql-yoga/queries/cart-and-page.gql'),
      variables: { color },
    })

    describe('when lookahead is called within Query field resolver', async () => {
      it('has find options in meta data including where argument of nested fields', () => {
        expect(result.extensions?.meta?.['Query.page'].nestedFindOptions).toEqual({
          include: [
            {
              association: 'content',
              include: [
                {
                  association: 'products',
                  where: {
                    id: { eq: '123' },
                    color: { in: [color] },
                  },
                  include: [{ association: 'inventory' }],
                },
              ],
            },
          ],
        })
      })

      it('finds "products" as the first list field', () => {
        expect(result.extensions?.meta?.['Query.page'].firstListFound).toEqual('products')
      })
    })

    describe('when lookahead is called within non-Query field resolver', async () => {
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

      describe('when looking at first call of `Product.inventory` in meta data', () => {
        it('has "hasIdField" set to false', () => {
          expect(result.extensions?.meta?.['Product.inventory'][0].hasIdField).toBe(false)
        })

        it('has "hasStockField" set to true', () => {
          expect(result.extensions?.meta?.['Product.inventory'][0].hasStockField).toBe(true)
        })
      })

      describe('when looking at second call of `Product.inventory` in meta data', () => {
        it('has "hasIdField" set to true', () => {
          expect(result.extensions?.meta?.['Product.inventory'][1].hasIdField).toBe(true)
        })

        it('has "hasStockField" set to true', () => {
          expect(result.extensions?.meta?.['Product.inventory'][1].hasStockField).toBe(true)
        })
      })

      describe('when looking at third call of `Product.inventory` in meta data', () => {
        it('has "hasIdField" set to true', () => {
          expect(result.extensions?.meta?.['Product.inventory'][2].hasIdField).toBe(true)
        })

        it('has "hasStockField" set to true', () => {
          expect(result.extensions?.meta?.['Product.inventory'][2].hasStockField).toBe(true)
        })
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
