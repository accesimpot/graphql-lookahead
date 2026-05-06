import { describe, it, expect } from 'vitest'
import {
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  GraphQLUnionType,
  graphql,
  type GraphQLResolveInfo,
} from 'graphql'
import { lookaheadAndThrow } from './main'

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
