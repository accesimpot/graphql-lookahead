import { describe, it, expect } from 'vitest'
import {
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  GraphQLUnionType,
  GraphQLInt,
  graphql,
  type GraphQLResolveInfo,
} from 'graphql'
import { lookaheadAndThrow, lookahead } from './main'

type PathState = { path: string[] }

function schemaWithPageAndBoxUnion(onPage: (info: GraphQLResolveInfo) => void) {
  const innerType = new GraphQLObjectType({
    name: 'Inner',
    fields: {
      child: {
        type: new GraphQLObjectType({
          name: 'InnerChild',
          fields: {
            leaf: { type: new GraphQLNonNull(GraphQLString) },
          },
        }),
      },
    },
  })
  const bigBox = new GraphQLObjectType({
    name: 'BigBox',
    fields: {
      inner: { type: new GraphQLNonNull(innerType) },
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
        resolve: () => ({
          __typename: 'BigBox',
          inner: { child: { leaf: 'x' } },
        }),
      },
    },
  })
  const queryType = new GraphQLObjectType({
    name: 'Query',
    fields: {
      page: {
        type: pageType,
        resolve(_root, _args, _ctx, info) {
          onPage(info)
          return {}
        },
      },
    },
  })
  return new GraphQLSchema({ query: queryType })
}

describe('default next', () => {
  it('passes through branch state from nextFragment when next is omitted', async () => {
    let childFieldState: PathState | undefined
    const schema = schemaWithPageAndBoxUnion(info => {
      lookaheadAndThrow({
        info,
        state: { path: [], isInitialState: true } as PathState & { isInitialState?: true },
        nextFragment({ state, type }) {
          if (type === 'BigBox') return { path: [...state.path, 'frag'] }
          return state
        },
        until({ field, state }) {
          if (field === 'child') childFieldState = state
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
    expect(childFieldState?.path).toEqual(['frag'])
    expect(childFieldState).not.toHaveProperty('isInitialState')
  })
})

describe('untyped inline fragments', () => {
  it('walks nested selections without calling nextFragment', async () => {
    let nextFragmentCalls = 0
    const untilFields: string[] = []

    const orderType = new GraphQLObjectType({
      name: 'Order',
      fields: {
        status: { type: new GraphQLNonNull(GraphQLString) },
        total: { type: new GraphQLNonNull(GraphQLInt) },
      },
    })
    const queryType = new GraphQLObjectType({
      name: 'Query',
      fields: {
        order: {
          type: orderType,
          resolve(_root, _args, _ctx, info) {
            lookaheadAndThrow({
              info,
              state: { path: [] } as PathState,
              nextFragment() {
                nextFragmentCalls++
                return { path: [] }
              },
              until({ field }) {
                untilFields.push(field)
                return false
              },
            })
            return { status: 'ok', total: 1 }
          },
        },
      },
    })
    const schema = new GraphQLSchema({ query: queryType })

    const result = await graphql({
      schema,
      source: `
        query {
          order {
            ... {
              total
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(nextFragmentCalls).toBe(0)
    expect(untilFields).toContain('total')
  })

  it('does not descend into untyped fragment when depth stops at parent', async () => {
    const untilFields: string[] = []

    const orderType = new GraphQLObjectType({
      name: 'Order',
      fields: {
        total: { type: new GraphQLNonNull(GraphQLInt) },
      },
    })
    const queryType = new GraphQLObjectType({
      name: 'Query',
      fields: {
        order: {
          type: orderType,
          resolve(_root, _args, _ctx, info) {
            lookaheadAndThrow({
              info,
              depth: 1,
              state: { path: [] } as PathState,
              until({ field }) {
                untilFields.push(field)
                return false
              },
            })
            return { total: 1 }
          },
        },
      },
    })
    const schema = new GraphQLSchema({ query: queryType })

    const result = await graphql({
      schema,
      source: `
        query {
          order {
            ... {
              total
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(untilFields).toHaveLength(0)
  })

  it('returns true when until matches inside untyped inline fragment', async () => {
    const orderType = new GraphQLObjectType({
      name: 'Order',
      fields: {
        total: { type: new GraphQLNonNull(GraphQLInt) },
      },
    })
    const queryType = new GraphQLObjectType({
      name: 'Query',
      fields: {
        order: {
          type: orderType,
          resolve(_root, _args, _ctx, info) {
            const hit = lookahead({
              info,
              until: ({ field }) => field === 'total',
            })
            expect(hit).toBe(true)
            return { total: 1 }
          },
        },
      },
    })
    const schema = new GraphQLSchema({ query: queryType })

    const result = await graphql({
      schema,
      source: `
        query {
          order {
            ... {
              total
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
  })
})

describe('default nextFragment', () => {
  it('passes through current branch state when nextFragment is omitted', async () => {
    const nextPaths: string[][] = []
    const schema = schemaWithPageAndBoxUnion(info => {
      lookaheadAndThrow({
        info,
        state: { path: [] } as PathState,
        next({ state, field }) {
          const nextState: PathState = { path: [...state.path, field] }
          nextPaths.push([...nextState.path])
          return nextState
        },
        // no nextFragment: must not reset to the root state inside the fragment
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
    expect(nextPaths).toEqual([['content'], ['content', 'inner'], ['content', 'inner', 'child']])
  })

  it('still allows custom nextFragment to override branch state', async () => {
    const nextPaths: string[][] = []
    const schema = schemaWithPageAndBoxUnion(info => {
      lookaheadAndThrow({
        info,
        state: { path: [], isInitialState: true } as PathState & { isInitialState?: true },
        next({ state, field }) {
          if (field === 'content') {
            expect(state.isInitialState).toBe(true)
          } else {
            expect(state.isInitialState).toBeUndefined()
          }
          const nextState: PathState = { path: [...state.path, field] }
          nextPaths.push([...nextState.path])
          return nextState
        },
        nextFragment({ state, type }) {
          expect(state.isInitialState).toBeUndefined()

          if (type === 'BigBox') return { path: [...state.path, '__frag__'] }
          return state
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
    expect(nextPaths).toEqual([
      ['content'],
      ['content', '__frag__', 'inner'],
      ['content', '__frag__', 'inner', 'child'],
    ])
  })
})
