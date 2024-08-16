import type { GraphQLResolveInfo, SelectionSetNode, SelectionNode } from 'graphql'
import {
  getSelectionDetails,
  findTypeName,
  findSelectionName,
  findSelectionSetForInfoPath,
} from './generic'

type HandlerDetails<TState> = {
  field: string
  selection: SelectionNode
  state: TState
  type: string
}

/**
 * Use `lookahead` to check within the resolver function if particular fields are part of the
 * operation (`info.operation`). This allows you to avoid querying nested database relationships
 * if they are not requested.
 *
 * @param options.info - GraphQLResolveInfo object which is usually the fourth argument of the resolver function.
 * @param options.next - Handler called for every nested field within the operation. It can return a state that will be passed to each `next` call of its direct child fields. See [Advanced usage](https://github.com/accesimpot/graphql-lookahead#advanced-usage).
 * @param options.state - Initial state used in `next` handler. See [Advanced usage](https://github.com/accesimpot/graphql-lookahead#advanced-usage).
 * @param options.until - Handler called for every nested field within the operation. Returning true will stop the iteration and make `lookahead` return true as well.
 */
export function lookahead<TState>(options: {
  info: Pick<GraphQLResolveInfo, 'operation' | 'schema' | 'fragments' | 'returnType' | 'path'>
  next?: (details: HandlerDetails<TState>) => TState
  state?: TState
  until?: (details: HandlerDetails<TState>) => boolean
}): boolean {
  const { info } = options
  const state = options.state as TState

  const returnTypeName = findTypeName(info.returnType)
  if (!returnTypeName) return false

  const selectionSet = findSelectionSetForInfoPath(info)

  if (selectionSet) {
    return lookDeeper({
      info,
      next: options.next,
      selectionSet,
      state,
      type: returnTypeName,
      until: options.until,
    })
  }
  return false
}

/**
 * Iterate over every nested field of the provided `selectionSet` (picked from `info.operation`). You can stop the iteration using the `until` option.
 *
 * @param options.next - Handler called for every nested field within the operation. It can return a state that will be passed to each `next` call of its direct child fields. See [Advanced usage](https://github.com/accesimpot/graphql-lookahead#advanced-usage).
 * @param options.schema - GraphQLResolveInfo['schema'] object
 * @param options.selectionSet - SelectionSetNode picked from GraphQLResolveInfo['operation']
 * @param options.state - Initial state used in `next` handler. See [Advanced usage](https://github.com/accesimpot/graphql-lookahead#advanced-usage).
 * @param options.until - Handler called for every nested field within the operation. Returning true will stop the iteration and make `lookahead` return true as well.
 */
export function lookDeeper<TState>(options: {
  info: Pick<GraphQLResolveInfo, 'schema' | 'fragments'>
  next?: (details: HandlerDetails<TState>) => TState
  selectionSet: SelectionSetNode
  state: TState
  type: string
  until?: (details: HandlerDetails<TState>) => boolean
}): boolean {
  const next: NonNullable<typeof options.next> = options.next || (() => options.state)
  const until: NonNullable<typeof options.until> = options.until || (() => false)

  return !!lookDeeperWithDefaults({ ...options, next, until })
}

function lookDeeperWithDefaults<TState>(options: {
  info: Pick<GraphQLResolveInfo, 'schema' | 'fragments'>
  next: (details: HandlerDetails<TState>) => TState
  selectionSet: SelectionSetNode
  state: TState
  type: string
  until: (details: HandlerDetails<TState>) => boolean
}): boolean | void {
  // Each selection represents a field or a fragment you're requesting inside the operation
  for (const selection of options.selectionSet.selections) {
    const selectionName = findSelectionName(selection)

    // This should only happen if the selection is invalid
    if (!selectionName) continue

    const { isFragmentSelection, nextSelectionSet, selectionTypeName } = getSelectionDetails({
      info: options.info,
      selection,
      selectionName,
      type: options.type,
    })

    if (selectionTypeName) {
      const handlerArgs: HandlerDetails<TState> = {
        field: selectionName,
        selection,
        state: options.state,
        type: selectionTypeName,
      }
      let lookDeeperState = options.state

      if (!isFragmentSelection) {
        if (options.until(handlerArgs)) return true

        if (nextSelectionSet) lookDeeperState = options.next(handlerArgs)
      }

      // Dig deeper if the field is an object with nested selections
      if (nextSelectionSet) {
        // The function looks deeper in the operation by calling itself
        const returnValue = lookDeeperWithDefaults({
          info: options.info,
          next: options.next,
          selectionSet: nextSelectionSet,
          state: lookDeeperState,
          type: selectionTypeName,
          until: options.until,
        })
        if (returnValue) return returnValue
      }
    }
  }
}
