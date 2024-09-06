import type { GraphQLResolveInfo } from 'graphql'
import cloneDeep from 'lodash.clonedeep'
// use relative import to use src files for test coverage
import { lookahead } from '../../../graphql-lookahead/src'

export function callInvalidOrderLookaheads(info: GraphQLResolveInfo) {
  if (!lookahead({ info, until: ({ field }) => field === 'invalidField', depth: 1 })) return

  // @ts-expect-error test invalid `next` option
  const invalidNext = lookahead({ info, next: 5 }) // returns true

  const invalidNextAndOnErrorReturningFalse = lookahead({
    info,
    // @ts-expect-error test invalid `next` option and `onError` returning false
    next: 'foo',
    onError: () => false,
  }) // returns false

  const invalidNextAndOnErrorReturningUndefined = lookahead({
    info,
    // @ts-expect-error test invalid `next` option and `onError` returning false
    next: 'foo',
    onError: () => undefined,
  }) // returns true

  const invalidInfoNextAndOnErrorReturningUndefined = lookahead({
    // @ts-expect-error test invalid `info`
    info: undefined,
    // @ts-expect-error test invalid `next` and `onError` options
    next: 'foo',
    onError: () => undefined,
  }) // returns true

  const invalidInfoWithoutOnError = lookahead({
    // @ts-expect-error test invalid `info`
    info: undefined,
    until: ({ field }) => field === 'total',
  }) // returns true

  const invalidInfoAndOnErrorReturningFalse = lookahead({
    // @ts-expect-error invalid `info` throwing when no `selectionSet` is found in `info.fieldNodes`
    info: { returnType: info.returnType, fieldNodes: [] },
    onError: () => false,
    until: ({ field }) => field === 'total',
  }) // returns false

  const invalidInfoAndOnErrorReturningUndefined = lookahead({
    // @ts-expect-error test invalid `info`
    info: undefined,
    onError: () => undefined,
    until: ({ field }) => field === 'total',
  }) // returns true

  const invalidInfoReturnType = lookahead({
    // @ts-expect-error test invalid `info`
    info: { ...info, returnType: { ...info.returnType, name: undefined } },
    onError: () => undefined,
    until: ({ field }) => field === 'total',
  }) // returns true

  const invalidSelectionName = lookahead({
    // @ts-expect-error test invalid `selectionName`
    info: copyInfoObjectWithInvalidSelectionName(info),
    until: ({ field }) => field === 'total',
  }) // returns true

  const noSelectionSetMatchingInfoPath = lookahead({
    info: {
      ...info,
      operation: {
        ...info.operation,
        selectionSet: {
          ...info.operation.selectionSet,
          selections: [],
        },
      },
    },
    until: ({ field }) => field === 'total',
  }) // returns true

  return {
    invalidNext,
    invalidNextAndOnErrorReturningFalse,
    invalidNextAndOnErrorReturningUndefined,
    invalidInfoNextAndOnErrorReturningUndefined,
    invalidInfoWithoutOnError,
    invalidInfoAndOnErrorReturningFalse,
    invalidInfoAndOnErrorReturningUndefined,
    invalidInfoReturnType,
    invalidSelectionName,
    noSelectionSetMatchingInfoPath,
  }
}

function copyInfoObjectWithInvalidSelectionName(
  info: GraphQLResolveInfo
): GraphQLResolveInfo | void {
  const infoCopy = cloneDeep(info)

  const orderSelect = infoCopy.operation.selectionSet.selections.find(
    s => 'name' in s && s.name.value === 'order'
  )
  if (!orderSelect || !('selectionSet' in orderSelect) || !orderSelect.selectionSet) return

  orderSelect.selectionSet.selections = [
    {
      ...orderSelect.selectionSet.selections[0],
      // @ts-expect-error test invalid `name`
      name: { ...orderSelect.selectionSet.selections[0].name, value: undefined },
    },
    ...orderSelect.selectionSet.selections.slice(1),
  ]
  return infoCopy
}
