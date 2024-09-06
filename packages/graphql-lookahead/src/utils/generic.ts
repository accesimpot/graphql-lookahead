import type { GraphQLType, GraphQLResolveInfo, SelectionSetNode, SelectionNode } from 'graphql'

export function getSelectionDetails(options: {
  info: Pick<GraphQLResolveInfo, 'schema' | 'fragments'>
  selection: SelectionNode
  selectionName: string
  type?: string
}) {
  const { info, selection, selectionName, type } = options

  let isFragmentSelection = false
  let nextSelectionSet: SelectionSetNode | undefined
  let selectionTypeName: string | undefined

  if (selection.kind === 'FragmentSpread') {
    isFragmentSelection = true

    const fragmentDefinition = info.fragments[selectionName]
    selectionTypeName = fragmentDefinition.typeCondition.name.value
    nextSelectionSet = fragmentDefinition.selectionSet
  } else {
    if ('selectionSet' in selection && selection.selectionSet) {
      nextSelectionSet = selection.selectionSet
    }
    if (selection.kind === 'InlineFragment') {
      isFragmentSelection = true
      selectionTypeName = selection.typeCondition?.name.value
    } else if (type) {
      const childFields = getChildFields(info.schema, type)

      if (childFields && selectionName in childFields) {
        selectionTypeName = findTypeName(childFields[selectionName].type)
      }
    }
  }
  return { isFragmentSelection, nextSelectionSet, selectionTypeName }
}

/**
 * Returns the child fields of a given type based on its definition in the schema.
 */
export function getChildFields(
  schema: Pick<GraphQLResolveInfo['schema'], 'getType'>,
  typeName: string
) {
  const genericTypeDefinition = schema.getType(typeName)
  const typeDefinition = genericTypeDefinition
    ? findTypeDefinition(genericTypeDefinition)
    : undefined

  // This should only happen if typeName is invalid
  if (!typeDefinition) return

  return 'getFields' in typeDefinition ? typeDefinition.getFields() : undefined
}

export function findTypeName(type: GraphQLType) {
  const typeDefinition = findTypeDefinition(type)
  return typeDefinition?.name
}

/**
 * Find the type definition object inside a GraphQLType object.
 *
 * This is needed for fields that are an array of a given GraphQL type
 * (i.e. items: [OrderItem]) and/or non-nullable type (!). In those cases, the initial
 * object will be an instance of GraphQLNonNull having an "ofType" property being an instance of
 * GraphQLList having an "ofType" being an instance of GraphQLObjectType (the type definition
 * object we want to find).
 */
export function findTypeDefinition(type: GraphQLType) {
  const typeDefinition = ('ofType' in type ? findTypeDefinition(type.ofType) : type) as
    | GraphQLType
    | undefined

  if (typeDefinition && 'name' in typeDefinition) return typeDefinition
}

export function findSelectionName(selection: SelectionNode) {
  const selectionNameObj =
    // When the selection has a type condition, it means it's an inline fragment
    'typeCondition' in selection
      ? selection.typeCondition
      : // Otherwise, it is simply a field of the parent selection
        'name' in selection
        ? selection
        : undefined

  if (!selectionNameObj || !('name' in selectionNameObj)) return

  return selectionNameObj.name.value
}
