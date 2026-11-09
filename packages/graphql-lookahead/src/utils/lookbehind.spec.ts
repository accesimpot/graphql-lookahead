import { describe, it, expect, vi } from 'vitest'
import {
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  GraphQLUnionType,
  GraphQLInt,
  graphql,
  type GraphQLResolveInfo,
} from 'graphql'
import {
  lookbehind,
  lookbehindAndThrow,
  lookHigher,
  lookHigherAndThrow,
  type PrevHandlerDetails,
} from './lookbehind'

type PathState = { path: string[] }

function createNestedSchema(options: {
  onLeaf?: (info: GraphQLResolveInfo) => void
  onProduct?: (info: GraphQLResolveInfo) => void
  onOrder?: (info: GraphQLResolveInfo) => void
}) {
  const productType = new GraphQLObjectType({
    name: 'Product',
    fields: {
      sku: {
        type: new GraphQLNonNull(GraphQLString),
        resolve(_parent, _args, _ctx, info) {
          options.onLeaf?.(info)
          return 'SKU-1'
        },
      },
    },
  })

  const orderItemType = new GraphQLObjectType({
    name: 'OrderItem',
    fields: {
      quantity: { type: new GraphQLNonNull(GraphQLInt) },
      product: {
        type: new GraphQLNonNull(productType),
        resolve(parent, _args, _ctx, info) {
          options.onProduct?.(info)
          return parent.product
        },
      },
    },
  })

  const orderType = new GraphQLObjectType({
    name: 'Order',
    fields: {
      id: { type: new GraphQLNonNull(GraphQLString) },
      item: {
        type: new GraphQLNonNull(orderItemType),
        resolve(parent, _args, _ctx, info) {
          options.onOrder?.(info)
          return parent.item
        },
      },
      items: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(orderItemType))),
      },
    },
  })

  const queryType = new GraphQLObjectType({
    name: 'Query',
    fields: {
      order: {
        type: orderType,
        resolve: () => ({
          id: '1',
          item: { quantity: 2, product: { sku: 'SKU-1' } },
          items: [
            { quantity: 1, product: { sku: 'SKU-1' } },
            { quantity: 2, product: { sku: 'SKU-2' } },
          ],
        }),
      },
    },
  })

  return new GraphQLSchema({ query: queryType })
}

function createUnionSchema(onLeaf: (info: GraphQLResolveInfo) => void) {
  const innerChildType = new GraphQLObjectType({
    name: 'InnerChild',
    fields: {
      leaf: {
        type: new GraphQLNonNull(GraphQLString),
        resolve(_parent, _args, _ctx, info) {
          onLeaf(info)
          return 'x'
        },
      },
    },
  })
  const innerType = new GraphQLObjectType({
    name: 'Inner',
    fields: {
      child: {
        type: new GraphQLNonNull(innerChildType),
        resolve: () => ({}),
      },
    },
  })
  const bigBox = new GraphQLObjectType({
    name: 'BigBox',
    fields: {
      inner: {
        type: new GraphQLNonNull(innerType),
        resolve: () => ({}),
      },
    },
  })
  const smallBox = new GraphQLObjectType({
    name: 'SmallBox',
    fields: {
      label: { type: new GraphQLNonNull(GraphQLString) },
    },
  })
  const boxUnion = new GraphQLUnionType({
    name: 'Box',
    types: [bigBox, smallBox],
    resolveType(value: { __typename: string }) {
      return value.__typename
    },
  })
  const pageType = new GraphQLObjectType({
    name: 'Page',
    fields: {
      content: {
        type: boxUnion,
        resolve: () => ({ __typename: 'BigBox' }),
      },
    },
  })
  const queryType = new GraphQLObjectType({
    name: 'Query',
    fields: {
      page: {
        type: pageType,
        resolve: () => ({}),
      },
    },
  })
  return new GraphQLSchema({ query: queryType })
}

describe('lookbehind nested queries', () => {
  it('walks parent fields from a nested resolver', async () => {
    const visited: Array<Pick<PrevHandlerDetails<unknown>, 'field' | 'sourceType' | 'type'>> = []

    const schema = createNestedSchema({
      onLeaf(info) {
        lookbehindAndThrow({
          info,
          until({ field, sourceType, type }) {
            visited.push({ field, sourceType, type })
            return false
          },
        })
      },
    })

    const result = await graphql({
      schema,
      source: `
        query {
          order {
            item {
              product {
                sku
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(visited).toEqual([
      { field: 'product', sourceType: 'OrderItem', type: 'Product' },
      { field: 'item', sourceType: 'Order', type: 'OrderItem' },
      { field: 'order', sourceType: 'Query', type: 'Order' },
    ])
  })

  it('returns true when until matches an ancestor and stops walking', async () => {
    const visited: string[] = []
    let hit: boolean | undefined

    const schema = createNestedSchema({
      onLeaf(info) {
        hit = lookbehind({
          info,
          until({ field }) {
            visited.push(field)
            return field === 'item'
          },
        })
      },
    })

    const result = await graphql({
      schema,
      source: `
        query {
          order {
            item {
              product {
                sku
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(hit).toBe(true)
    expect(visited).toEqual(['product', 'item'])
  })

  it('respects depth and only visits the immediate parent when depth is 1', async () => {
    const visited: string[] = []

    const schema = createNestedSchema({
      onLeaf(info) {
        lookbehindAndThrow({
          info,
          depth: 1,
          until({ field }) {
            visited.push(field)
            return false
          },
        })
      },
    })

    const result = await graphql({
      schema,
      source: `
        query {
          order {
            item {
              product {
                sku
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(visited).toEqual(['product'])
  })

  it('threads state upward through next', async () => {
    const nextPaths: string[][] = []
    let finalState: PathState | undefined

    const schema = createNestedSchema({
      onLeaf(info) {
        lookbehindAndThrow({
          info,
          state: { path: [] } as PathState,
          next({ state, field }) {
            const nextState: PathState = { path: [...state.path, field] }
            nextPaths.push([...nextState.path])
            return nextState
          },
          until({ field, state }) {
            if (field === 'order') finalState = state
            return false
          },
        })
      },
    })

    const result = await graphql({
      schema,
      source: `
        query {
          order {
            item {
              product {
                sku
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(nextPaths).toEqual([['product'], ['product', 'item'], ['product', 'item', 'order']])
    // until sees state before next updates it for that step
    expect(finalState?.path).toEqual(['product', 'item'])
  })

  it('exposes listIndex when walking through list path keys', async () => {
    const detailsByField: Record<string, { listIndex?: number; isList: boolean }> = {}
    let captured = false

    const schema = createNestedSchema({
      onLeaf(info) {
        // Capture the first list item only (`items[0]`) — later indices would overwrite.
        if (captured) return
        captured = true

        lookbehindAndThrow({
          info,
          until(details) {
            detailsByField[details.field] = {
              listIndex: details.listIndex,
              isList: details.isList,
            }
            return false
          },
        })
      },
    })

    const result = await graphql({
      schema,
      source: `
        query {
          order {
            items {
              product {
                sku
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(detailsByField.product).toEqual({ listIndex: undefined, isList: false })
    expect(detailsByField.items).toEqual({ listIndex: 0, isList: true })
    expect(detailsByField.order).toEqual({ listIndex: undefined, isList: false })
  })

  it('returns false when no ancestor matches', async () => {
    let hit: boolean | undefined

    const schema = createNestedSchema({
      onLeaf(info) {
        hit = lookbehindAndThrow({
          info,
          until: ({ field }) => field === 'missing',
        })
      },
    })

    const result = await graphql({
      schema,
      source: `
        query {
          order {
            item {
              product {
                sku
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(hit).toBe(false)
  })

  it('runs afterAllParents hooks after finishing the upward walk', async () => {
    const events: string[] = []

    const schema = createNestedSchema({
      onLeaf(info) {
        lookbehindAndThrow({
          info,
          until({ field }) {
            events.push(`until:${field}`)
            if (field === 'product') {
              return {
                afterAllParents({ field: hookField }) {
                  events.push(`after:${hookField}`)
                },
              }
            }
            return false
          },
        })
      },
    })

    const result = await graphql({
      schema,
      source: `
        query {
          order {
            item {
              product {
                sku
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(events).toEqual(['until:product', 'until:item', 'until:order', 'after:product'])
  })
})

describe('lookbehind with aliases', () => {
  it('resolves root and nested aliases to schema field names', async () => {
    const visited: Array<
      Pick<PrevHandlerDetails<unknown>, 'field' | 'responseKey' | 'sourceType' | 'type'>
    > = []

    const schema = createNestedSchema({
      onLeaf(info) {
        lookbehindAndThrow({
          info,
          until({ field, responseKey, sourceType, type }) {
            visited.push({ field, responseKey, sourceType, type })
            return false
          },
        })
      },
    })

    const result = await graphql({
      schema,
      source: `
        query {
          renamedOrder: order {
            renamedItem: item {
              renamedProduct: product {
                sku
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(visited).toEqual([
      {
        field: 'product',
        responseKey: 'renamedProduct',
        sourceType: 'OrderItem',
        type: 'Product',
      },
      {
        field: 'item',
        responseKey: 'renamedItem',
        sourceType: 'Order',
        type: 'OrderItem',
      },
      {
        field: 'order',
        responseKey: 'renamedOrder',
        sourceType: 'Query',
        type: 'Order',
      },
    ])
  })

  it('matches until handlers on schema field names when ancestors are aliased', async () => {
    let hit: boolean | undefined
    const visited: string[] = []

    const schema = createNestedSchema({
      onLeaf(info) {
        hit = lookbehind({
          info,
          until({ field }) {
            visited.push(field)
            return field === 'item'
          },
        })
      },
    })

    const result = await graphql({
      schema,
      source: `
        query {
          renamedOrder: order {
            renamedItem: item {
              product {
                sku
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(hit).toBe(true)
    expect(visited).toEqual(['product', 'item'])
  })

  it('resolves aliases nested under typed inline fragments', async () => {
    const visited: Array<{ field: string; responseKey: string; sourceType: string }> = []

    const schema = createUnionSchema(info => {
      lookbehindAndThrow({
        info,
        until({ field, responseKey, sourceType }) {
          visited.push({ field, responseKey, sourceType })
          return false
        },
      })
    })

    const result = await graphql({
      schema,
      source: `
        query {
          renamedPage: page {
            renamedContent: content {
              ... on SmallBox {
                label
              }
              ... on BigBox {
                renamedInner: inner {
                  renamedChild: child {
                    leaf
                  }
                }
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(visited).toEqual([
      { field: 'child', responseKey: 'renamedChild', sourceType: 'Inner' },
      { field: 'inner', responseKey: 'renamedInner', sourceType: 'BigBox' },
      { field: 'content', responseKey: 'renamedContent', sourceType: 'Page' },
      { field: 'page', responseKey: 'renamedPage', sourceType: 'Query' },
    ])
  })

  it('resolves aliases nested under fragment spreads', async () => {
    const visited: Array<{ field: string; responseKey: string }> = []

    const schema = createUnionSchema(info => {
      lookbehindAndThrow({
        info,
        until({ field, responseKey }) {
          visited.push({ field, responseKey })
          return false
        },
      })
    })

    const result = await graphql({
      schema,
      source: `
        query {
          page {
            content {
              ...BigBoxFields
            }
          }
        }

        fragment BigBoxFields on BigBox {
          renamedInner: inner {
            renamedChild: child {
              leaf
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(visited).toEqual([
      { field: 'child', responseKey: 'renamedChild' },
      { field: 'inner', responseKey: 'renamedInner' },
      { field: 'content', responseKey: 'content' },
      { field: 'page', responseKey: 'page' },
    ])
  })

  it('exposes listIndex with aliased list ancestors', async () => {
    const detailsByField: Record<
      string,
      { responseKey: string; listIndex?: number; isList: boolean }
    > = {}
    let captured = false

    const schema = createNestedSchema({
      onLeaf(info) {
        if (captured) return
        captured = true

        lookbehindAndThrow({
          info,
          until(details) {
            detailsByField[details.field] = {
              responseKey: details.responseKey,
              listIndex: details.listIndex,
              isList: details.isList,
            }
            return false
          },
        })
      },
    })

    const result = await graphql({
      schema,
      source: `
        query {
          renamedOrder: order {
            renamedItems: items {
              product {
                sku
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(detailsByField.product).toEqual({
      responseKey: 'product',
      listIndex: undefined,
      isList: false,
    })
    expect(detailsByField.items).toEqual({
      responseKey: 'renamedItems',
      listIndex: 0,
      isList: true,
    })
    expect(detailsByField.order).toEqual({
      responseKey: 'renamedOrder',
      listIndex: undefined,
      isList: false,
    })
  })
})

describe('lookbehind with fragments', () => {
  it('walks parents when the resolve path starts inside a typed inline fragment', async () => {
    const visited: Array<{ field: string; sourceType: string }> = []

    const schema = createUnionSchema(info => {
      lookbehindAndThrow({
        info,
        until({ field, sourceType }) {
          visited.push({ field, sourceType })
          return false
        },
      })
    })

    const result = await graphql({
      schema,
      source: `
        query {
          page {
            content {
              ... on BigBox {
                inner {
                  child {
                    leaf
                  }
                }
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(visited).toEqual([
      { field: 'child', sourceType: 'Inner' },
      { field: 'inner', sourceType: 'BigBox' },
      { field: 'content', sourceType: 'Page' },
      { field: 'page', sourceType: 'Query' },
    ])
  })

  it('walks parents when nested under a fragment spread', async () => {
    const visited: string[] = []

    const schema = createUnionSchema(info => {
      lookbehindAndThrow({
        info,
        until({ field }) {
          visited.push(field)
          return false
        },
      })
    })

    const result = await graphql({
      schema,
      source: `
        query {
          page {
            content {
              ...BigBoxFields
            }
          }
        }

        fragment BigBoxFields on BigBox {
          inner {
            child {
              leaf
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(visited).toEqual(['child', 'inner', 'content', 'page'])
  })

  it('walks parents when nested under an untyped inline fragment', async () => {
    const visited: string[] = []

    const schema = createNestedSchema({
      onLeaf(info) {
        lookbehindAndThrow({
          info,
          until({ field }) {
            visited.push(field)
            return false
          },
        })
      },
    })

    const result = await graphql({
      schema,
      source: `
        query {
          order {
            ... {
              item {
                ... {
                  product {
                    sku
                  }
                }
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(visited).toEqual(['product', 'item', 'order'])
  })

  it('still matches ancestors when until runs from inside a typed inline fragment', async () => {
    let hit: boolean | undefined

    const schema = createUnionSchema(info => {
      hit = lookbehind({
        info,
        until: ({ field, sourceType }) => field === 'content' && sourceType === 'Page',
      })
    })

    const result = await graphql({
      schema,
      source: `
        query {
          page {
            content {
              ... on BigBox {
                inner {
                  child {
                    leaf
                  }
                }
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(hit).toBe(true)
  })
})

describe('lookHigher', () => {
  it('returns false when path is undefined (root field has no parent)', async () => {
    let hit: boolean | undefined

    const queryType = new GraphQLObjectType({
      name: 'Query',
      fields: {
        ping: {
          type: new GraphQLNonNull(GraphQLString),
          resolve(_root, _args, _ctx, info) {
            hit = lookHigherAndThrow({
              info,
              path: info.path.prev,
              state: undefined,
              until: () => true,
            })
            return 'pong'
          },
        },
      },
    })
    const schema = new GraphQLSchema({ query: queryType })

    const result = await graphql({ schema, source: '{ ping }' })

    expect(result.errors).toBeUndefined()
    expect(hit).toBe(false)
  })

  it('can start from an arbitrary path step', async () => {
    const visited: string[] = []

    const schema = createNestedSchema({
      onLeaf(info) {
        lookHigherAndThrow({
          info,
          // Skip the immediate parent (`product`) and start at `item`
          path: info.path.prev?.prev,
          until({ field }) {
            visited.push(field)
            return false
          },
        })
      },
    })

    const result = await graphql({
      schema,
      source: `
        query {
          order {
            item {
              product {
                sku
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(visited).toEqual(['item', 'order'])
  })

  it('uses default next/until when omitted and still walks parents', async () => {
    let hit: boolean | undefined

    const schema = createNestedSchema({
      onLeaf(info) {
        hit = lookHigherAndThrow({
          info,
          path: info.path.prev,
          state: undefined,
        })
      },
    })

    const result = await graphql({
      schema,
      source: `
        query {
          order {
            item {
              product {
                sku
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(hit).toBe(false)
  })

  it('skips synthetic path steps with missing typename or unknown fields', async () => {
    const visited: string[] = []

    const schema = createNestedSchema({
      onLeaf(info) {
        lookHigherAndThrow({
          info,
          state: undefined,
          path: {
            key: 'ghost',
            typename: undefined,
            prev: {
              key: 'notAField',
              typename: 'Query',
              prev: {
                key: 'order',
                typename: 'Query',
                prev: undefined,
              },
            },
          },
          until({ field }) {
            visited.push(field)
            return false
          },
        })
      },
    })

    const result = await graphql({
      schema,
      source: `
        query {
          order {
            item {
              product {
                sku
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(visited).toEqual(['order'])
  })

  it('skips path steps whose field type has no GraphQL name', async () => {
    const visited: string[] = []

    const schema = createNestedSchema({
      onLeaf(info) {
        lookHigherAndThrow({
          info: {
            ...info,
            schema: {
              getType(name: string) {
                if (name === 'Broken') {
                  return {
                    name: 'Broken',
                    getFields: () => ({
                      nameless: {
                        name: 'nameless',
                        // No `name` / `ofType` → findTypeName returns undefined
                        type: {},
                        args: [],
                      },
                    }),
                  } as unknown as GraphQLObjectType
                }
                return info.schema.getType(name)
              },
            } as GraphQLSchema,
          },
          state: undefined,
          path: {
            key: 'nameless',
            typename: 'Broken',
            prev: undefined,
          },
          until({ field }) {
            visited.push(field)
            return false
          },
        })
      },
    })

    const result = await graphql({
      schema,
      source: `
        query {
          order {
            item {
              product {
                sku
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(visited).toEqual([])
  })

  it('treats nullable list field types as isList', async () => {
    let itemsIsList: boolean | undefined

    const productType = new GraphQLObjectType({
      name: 'Product',
      fields: {
        sku: {
          type: GraphQLString,
          resolve(_parent, _args, _ctx, info) {
            lookbehindAndThrow({
              info,
              until({ field, isList }) {
                if (field === 'items') itemsIsList = isList
                return false
              },
            })
            return 'x'
          },
        },
      },
    })
    const itemType = new GraphQLObjectType({
      name: 'Item',
      fields: {
        product: {
          type: productType,
          resolve: () => ({}),
        },
      },
    })
    const orderType = new GraphQLObjectType({
      name: 'Order',
      fields: {
        // Nullable list (not NonNull-wrapped) exercises the bare `isListType` branch
        items: { type: new GraphQLList(itemType) },
      },
    })
    const queryType = new GraphQLObjectType({
      name: 'Query',
      fields: {
        order: {
          type: orderType,
          resolve: () => ({ items: [{ product: {} }] }),
        },
      },
    })
    const schema = new GraphQLSchema({ query: queryType })

    const result = await graphql({
      schema,
      source: `{ order { items { product { sku } } } }`,
    })

    expect(result.errors).toBeUndefined()
    expect(itemsIsList).toBe(true)
  })
})

describe('lookbehind error handling', () => {
  it('returns true and logs when a handler throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    let hit: boolean | undefined

    const schema = createNestedSchema({
      onLeaf(info) {
        hit = lookbehind({
          info,
          until() {
            throw new Error('boom')
          },
        })
      },
    })

    const result = await graphql({
      schema,
      source: `
        query {
          order {
            item {
              product {
                sku
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(hit).toBe(true)
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('uses onError return value when provided', async () => {
    let hit: boolean | undefined

    const schema = createNestedSchema({
      onLeaf(info) {
        hit = lookbehind({
          info,
          onError: () => false,
          until() {
            throw new Error('boom')
          },
        })
      },
    })

    const result = await graphql({
      schema,
      source: `
        query {
          order {
            item {
              product {
                sku
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(hit).toBe(false)
  })

  it('lookHigher uses onError the same way', async () => {
    let hit: boolean | undefined

    const schema = createNestedSchema({
      onLeaf(info) {
        hit = lookHigher({
          info,
          path: info.path.prev,
          state: undefined,
          onError: () => false,
          until() {
            throw new Error('boom')
          },
        })
      },
    })

    const result = await graphql({
      schema,
      source: `
        query {
          order {
            item {
              product {
                sku
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(hit).toBe(false)
  })

  it('lookHigher ignores non-boolean onError return values and falls back to true', async () => {
    let hit: boolean | undefined

    const schema = createNestedSchema({
      onLeaf(info) {
        hit = lookHigher({
          info,
          path: info.path.prev,
          state: undefined,
          onError: () => undefined,
          until() {
            throw new Error('boom')
          },
        })
      },
    })

    const result = await graphql({
      schema,
      source: `
        query {
          order {
            item {
              product {
                sku
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(hit).toBe(true)
  })

  it('lookHigher logs and returns true when onError is omitted', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    let hit: boolean | undefined

    const schema = createNestedSchema({
      onLeaf(info) {
        hit = lookHigher({
          info,
          path: info.path.prev,
          state: undefined,
          until() {
            throw new Error('boom')
          },
        })
      },
    })

    const result = await graphql({
      schema,
      source: `
        query {
          order {
            item {
              product {
                sku
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(hit).toBe(true)
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('ignores non-boolean onError return values and falls back to true', async () => {
    let hit: boolean | undefined

    const schema = createNestedSchema({
      onLeaf(info) {
        hit = lookbehind({
          info,
          onError: () => undefined,
          until() {
            throw new Error('boom')
          },
        })
      },
    })

    const result = await graphql({
      schema,
      source: `
        query {
          order {
            item {
              product {
                sku
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(hit).toBe(true)
  })

  it('lookbehindAndThrow propagates handler errors', async () => {
    let thrown: unknown

    const schema = createNestedSchema({
      onLeaf(info) {
        try {
          lookbehindAndThrow({
            info,
            until() {
              throw new Error('boom')
            },
          })
        } catch (err) {
          thrown = err
        }
      },
    })

    const result = await graphql({
      schema,
      source: `
        query {
          order {
            item {
              product {
                sku
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(thrown).toEqual(new Error('boom'))
  })
})
