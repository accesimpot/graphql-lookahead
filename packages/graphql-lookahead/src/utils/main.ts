import type { GraphQLResolveInfo, SelectionSetNode } from 'graphql'
import {
  findTypeName,
  findTypeDefinitionByName,
  findSelectionName,
  findSelectionSetForInfoPath,
} from './generic'

type HandlerDetails<TState> = {
  fieldName: string
  next: Handler<TState>
  state: TState
  typeName: string
  schema: GraphQLResolveInfo['schema']
  selectionSet: SelectionSetNode
}
type Handler<TState> = (details: HandlerDetails<TState>) => TState

export function lookahead<TState>(options: {
  info: Pick<GraphQLResolveInfo, 'operation' | 'schema' | 'returnType' | 'path'>
  next: Handler<TState>
  state?: TState
}): void {
  const { info } = options
  const state = options.state as TState

  const returnTypeName = findTypeName(info.returnType)
  if (!returnTypeName) return

  const selectionSet = findSelectionSetForInfoPath(info)

  if (selectionSet) {
    lookDeeper({
      next: options.next,
      state,
      typeName: returnTypeName,
      schema: info.schema,
      selectionSet,
    })
  }
}

function lookDeeper<TState>(options: {
  next?: Handler<TState>
  state: TState
  typeName: string
  schema: GraphQLResolveInfo['schema']
  selectionSet: SelectionSetNode
}): void {
  const next: NonNullable<typeof options.next> = options.next || (() => options.state)

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
      const lookUntilArgs: Required<typeof options> = {
        next,
        state: options.state,
        typeName: selectionTypeName,
        schema: options.schema,
        selectionSet: selection.selectionSet,
      }
      const handlerArgs: HandlerDetails<TState> = {
        ...lookUntilArgs,
        fieldName: selectionName,
      }

      lookUntilArgs.state = next(handlerArgs)

      // The function looks deeper in the operation by calling itself
      lookDeeper(lookUntilArgs)
    }
  }
}
