import type { GraphQLResolveInfo, SelectionSetNode } from 'graphql'
import { findTypeName, findTypeDefinition } from './generic'

type HandlerDetails<TState> = {
  fieldName: string
  next: Handler<TState>
  state: TState
  typeName: string
  schema: GraphQLResolveInfo['schema']
  selectionSet: SelectionSetNode
  until?: (details: HandlerDetails<TState>) => boolean | undefined
}
type Handler<TState> = (details: HandlerDetails<TState>) => TState

const QUERY_TYPE = 'Query'

export function lookahead<TState>(options: {
  info: Pick<GraphQLResolveInfo, 'operation' | 'schema' | 'parentType' | 'returnType' | 'fieldName'>
  next: Handler<TState>
  state?: TState
}): void {
  const { info } = options
  const state = options.state as TState

  lookUntil({
    state,
    typeName: QUERY_TYPE,
    schema: info.schema,
    selectionSet: info.operation.selectionSet,

    until: details => {
      if ('name' in info.returnType && details.typeName === info.returnType.name) {
        lookUntil({
          next: options.next,
          state,
          typeName: details.typeName,
          schema: details.schema,
          selectionSet: details.selectionSet,
        })
        return true
      }
      return false
    },
  })
}

export function lookUntil<TState>(options: {
  next?: Handler<TState>
  state: TState
  typeName: string
  schema: GraphQLResolveInfo['schema']
  selectionSet: SelectionSetNode
  until?: (details: HandlerDetails<TState>) => boolean | undefined
}): boolean | undefined {
  const next: NonNullable<typeof options.next> = options.next || (() => options.state)
  const until: NonNullable<typeof options.until> = options.until || (() => false)

  // Get the definition of the parent type in order to get all its possible fields (getFields)
  const possibleTypeDefinition = options.schema.getType(options.typeName)
  const typeDefinition = possibleTypeDefinition
    ? findTypeDefinition(possibleTypeDefinition)
    : undefined

  // This should never happen
  if (!typeDefinition) return

  const childFields = 'getFields' in typeDefinition ? typeDefinition.getFields() : undefined

  // Each selection represents a field or a fragment you're requesting inside the operation
  for (const selection of options.selectionSet.selections) {
    const selectionNameObj =
      // When the selection has a type condition, it means it's an inline fragment
      'typeCondition' in selection
        ? selection.typeCondition
        : // Otherwise, it is simply a field of the parent selection
          'name' in selection
          ? selection
          : undefined

    // This should never happen
    if (!selectionNameObj || !('name' in selectionNameObj)) continue

    const selectionName = selectionNameObj.name.value

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
      const lookUntilArgs: Required<typeof options> = {
        next,
        state: options.state,
        typeName: selectionTypeName,
        schema: options.schema,
        selectionSet: selection.selectionSet,
        until,
      }
      const handlerArgs: HandlerDetails<TState> = {
        ...lookUntilArgs,
        fieldName: selectionName,
      }

      // Break the loop if "until" handler returns true
      if (until(handlerArgs)) return true

      lookUntilArgs.state = next(handlerArgs)

      // The function looks deeper in the operation by calling itself
      const returnValue = lookUntil(lookUntilArgs)

      // Break the loop if "until" handler returns true deeper down the chain
      if (returnValue === true) return returnValue
    }
  }
}
