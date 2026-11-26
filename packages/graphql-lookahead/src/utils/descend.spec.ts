import { describe, it, expect } from 'vitest'
import {
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  graphql,
  type GraphQLResolveInfo,
} from 'graphql'
import { lookaheadAndThrow } from './main'

type PathState = { path: string[] }

function schemaWithNestedSiblings(onPage: (info: GraphQLResolveInfo) => void) {
  const leafType = new GraphQLObjectType({
    name: 'Leaf',
    fields: {
      value: { type: new GraphQLNonNull(GraphQLString) },
    },
  })
  const nestedType = new GraphQLObjectType({
    name: 'Nested',
    fields: {
      child: { type: new GraphQLNonNull(leafType) },
    },
  })
  const pageType = new GraphQLObjectType({
    name: 'Page',
    fields: {
      pruned: { type: new GraphQLNonNull(nestedType) },
      sibling: { type: new GraphQLNonNull(nestedType) },
      plain: { type: new GraphQLNonNull(nestedType) },
      explicitTrue: { type: new GraphQLNonNull(nestedType) },
      wrappedOnly: { type: new GraphQLNonNull(nestedType) },
    },
  })
  const queryType = new GraphQLObjectType({
    name: 'Query',
    fields: {
      page: {
        type: pageType,
        resolve(_root, _args, _ctx, info) {
          onPage(info)
          return {
            pruned: { child: { value: 'a' } },
            sibling: { child: { value: 'b' } },
            plain: { child: { value: 'c' } },
            explicitTrue: { child: { value: 'd' } },
            wrappedOnly: { child: { value: 'e' } },
          }
        },
      },
    },
  })
  return new GraphQLSchema({ query: queryType })
}

describe('next return descend', () => {
  it('does not visit nested fields when next returns { state, descend: false }', async () => {
    const untilFields: string[] = []
    const nextFields: string[] = []

    const schema = schemaWithNestedSiblings(info => {
      lookaheadAndThrow({
        info,
        state: { path: [] } as PathState,
        next({ state, field }) {
          nextFields.push(field)
          const nextState: PathState = { path: [...state.path, field] }
          if (field === 'pruned') return { state: nextState, descend: false }
          return nextState
        },
        until({ field }) {
          untilFields.push(field)
          return false
        },
      })
    })

    const result = await graphql({
      schema,
      source: `
        query {
          page {
            pruned {
              child {
                value
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(nextFields).toEqual(['pruned'])
    expect(untilFields).toEqual(['pruned'])
    expect(untilFields).not.toContain('child')
    expect(untilFields).not.toContain('value')
  })

  it('still visits sibling fields after a pruned field', async () => {
    const untilFields: string[] = []
    const nextFields: string[] = []

    const schema = schemaWithNestedSiblings(info => {
      lookaheadAndThrow({
        info,
        state: { path: [] } as PathState,
        next({ state, field }) {
          nextFields.push(field)
          const nextState: PathState = { path: [...state.path, field] }
          if (field === 'pruned') return { state: nextState, descend: false }
          return nextState
        },
        until({ field }) {
          untilFields.push(field)
          return false
        },
      })
    })

    const result = await graphql({
      schema,
      source: `
        query {
          page {
            pruned {
              child {
                value
              }
            }
            sibling {
              child {
                value
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    // next only for fields with subfields: pruned (no children walked), sibling, then sibling.child
    expect(nextFields).toEqual(['pruned', 'sibling', 'child'])
    // until sees pruned itself, then the sibling branch fully — not pruned.child / pruned.child.value
    expect(untilFields).toEqual(['pruned', 'sibling', 'child', 'value'])
  })

  it('still descends when next returns a plain TState', async () => {
    const untilFields: string[] = []
    const nextFields: string[] = []

    const schema = schemaWithNestedSiblings(info => {
      lookaheadAndThrow({
        info,
        state: { path: [] } as PathState,
        next({ state, field }) {
          nextFields.push(field)
          return { path: [...state.path, field] }
        },
        until({ field }) {
          untilFields.push(field)
          return false
        },
      })
    })

    const result = await graphql({
      schema,
      source: `
        query {
          page {
            plain {
              child {
                value
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(nextFields).toEqual(['plain', 'child'])
    expect(untilFields).toEqual(['plain', 'child', 'value'])
  })

  it('still descends when next returns { state, descend: true }', async () => {
    const untilFields: string[] = []
    const nextFields: string[] = []

    const schema = schemaWithNestedSiblings(info => {
      lookaheadAndThrow({
        info,
        state: { path: [] } as PathState,
        next({ state, field }) {
          nextFields.push(field)
          return { state: { path: [...state.path, field] }, descend: true }
        },
        until({ field }) {
          untilFields.push(field)
          return false
        },
      })
    })

    const result = await graphql({
      schema,
      source: `
        query {
          page {
            explicitTrue {
              child {
                value
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(nextFields).toEqual(['explicitTrue', 'child'])
    expect(untilFields).toEqual(['explicitTrue', 'child', 'value'])
  })

  it('still descends when next returns { state } without descend', async () => {
    const untilFields: string[] = []
    const nextFields: string[] = []

    const schema = schemaWithNestedSiblings(info => {
      lookaheadAndThrow({
        info,
        state: { path: [] } as PathState,
        next({ state, field }) {
          nextFields.push(field)
          return { state: { path: [...state.path, field] } }
        },
        until({ field }) {
          untilFields.push(field)
          return false
        },
      })
    })

    const result = await graphql({
      schema,
      source: `
        query {
          page {
            wrappedOnly {
              child {
                value
              }
            }
          }
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(nextFields).toEqual(['wrappedOnly', 'child'])
    expect(untilFields).toEqual(['wrappedOnly', 'child', 'value'])
  })
})
