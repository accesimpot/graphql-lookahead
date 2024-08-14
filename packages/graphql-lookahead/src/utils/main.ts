import type { GraphQLResolveInfo, SelectionSetNode } from 'graphql'
import {
  findTypeName,
  findTypeDefinitionByName,
  findSelectionName,
  findSelectionSetForInfoPath,
} from './generic'

type HandlerDetails<TState> = {
  fieldName: string
  selectionSet: SelectionSetNode
  state: TState
  typeName: string
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
  info: Pick<GraphQLResolveInfo, 'operation' | 'schema' | 'returnType' | 'path'>
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
      next: options.next,
      schema: info.schema,
      selectionSet,
      state,
      typeName: returnTypeName,
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
  next?: (details: HandlerDetails<TState>) => TState
  schema: GraphQLResolveInfo['schema']
  selectionSet: SelectionSetNode
  state: TState
  typeName: string
  until?: (details: HandlerDetails<TState>) => boolean
}): boolean {
  const next: NonNullable<typeof options.next> = options.next || (() => options.state)
  const until: NonNullable<typeof options.until> = options.until || (() => false)

  return !!lookDeeperWithDefaults({ ...options, next, until })
}

function lookDeeperWithDefaults<TState>(options: {
  next: (details: HandlerDetails<TState>) => TState
  schema: GraphQLResolveInfo['schema']
  selectionSet: SelectionSetNode
  state: TState
  typeName: string
  until: (details: HandlerDetails<TState>) => boolean
}): boolean | void {
  // Get the definition of the parent type in order to get all its possible fields (getFields)
  const typeDefinition = findTypeDefinitionByName(options.schema, options.typeName)

  // This should only happen if options.typeName is invalid
  if (!typeDefinition) return

  const childFields = 'getFields' in typeDefinition ? typeDefinition.getFields() : undefined

  // Each selection represents a field or a fragment you're requesting inside the operation
  for (const selection of options.selectionSet.selections) {
    const selectionName = findSelectionName(selection)

    // This should only happen if the selection is invalid
    if (!selectionName) continue

    let selectionTypeName: string | undefined

    if (childFields && selectionName in childFields) {
      selectionTypeName = findTypeName(childFields[selectionName].type)
    } else if ('typeCondition' in selection) {
      // The type condition means it's an inline fragment,
      // but it also means we already know the selection type name
      selectionTypeName = selection.typeCondition?.name.value
    }

    // Dig deeper if the field is an object with nested selections
    if (selectionTypeName && 'selectionSet' in selection && selection.selectionSet) {
      const sharedArgs = {
        selectionSet: selection.selectionSet,
        state: options.state,
        typeName: selectionTypeName,
      }
      const lookUntilArgs: Required<typeof options> = {
        ...sharedArgs,
        next: options.next,
        schema: options.schema,
        until: options.until,
      }
      const handlerArgs: HandlerDetails<TState> = {
        ...sharedArgs,
        fieldName: selectionName,
      }

      if (options.until(handlerArgs)) return true

      lookUntilArgs.state = options.next(handlerArgs)

      // The function looks deeper in the operation by calling itself
      const returnValue = lookDeeperWithDefaults(lookUntilArgs)
      if (returnValue) return returnValue
    }
  }
}
