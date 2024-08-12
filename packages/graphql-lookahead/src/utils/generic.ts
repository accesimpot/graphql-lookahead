import type { GraphQLType, GraphQLResolveInfo, SelectionSetNode, SelectionNode } from 'graphql'

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

export function findTypeDefinitionByName(schema: GraphQLResolveInfo['schema'], typeName: string) {
  const possibleTypeDefinition = schema.getType(typeName)
  return possibleTypeDefinition ? findTypeDefinition(possibleTypeDefinition) : undefined
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

  // This should never happen
  if (!selectionNameObj || !('name' in selectionNameObj)) return

  return selectionNameObj.name.value
}

export function findSelectionSetForInfoPath(
  options: Pick<GraphQLResolveInfo, 'operation' | 'path'>
) {
  return findSelectionSetForPathArray({
    paths: pathToArray(options.path),
    pathIndex: 0,
    selectionSet: options.operation.selectionSet,
  })
}

function findSelectionSetForPathArray(options: {
  paths: ReturnType<typeof pathToArray>
  pathIndex: number
  selectionSet: SelectionSetNode
}) {
  const currentSelectionPath: (typeof options.paths)[0] | undefined =
    options.paths[options.pathIndex]
  if (!currentSelectionPath) return options.selectionSet

  const selectionSet = options.selectionSet

  let currentSelection: (typeof selectionSet.selections)[0] | undefined

  if (typeof currentSelectionPath.key === 'number') {
    currentSelection = selectionSet.selections[currentSelectionPath.key]
  } else {
    const findByName = (select: SelectionNode) => {
      if ('name' in select && select.name.value === currentSelectionPath.key) return select
    }
    for (const selection of selectionSet.selections) {
      currentSelection = findByName(selection)

      if (currentSelection) break
      else if (
        'typeCondition' in selection &&
        selection.typeCondition?.name.value === currentSelectionPath.typename
      ) {
        currentSelection = selection.selectionSet.selections.find(findByName)
      }
    }
  }

  if (!currentSelection || !('selectionSet' in currentSelection)) return

  if (currentSelection.selectionSet) {
    if (options.pathIndex >= options.paths.length) return currentSelection.selectionSet

    return findSelectionSetForPathArray({
      paths: options.paths,
      pathIndex: options.pathIndex + 1,
      selectionSet: currentSelection.selectionSet,
    })
  }
}

/**
 * Given a Path, return an Array of the path object in the reversed order.
 *
 * Inspired by `pathToArray` from 'graphql', but instead of returning only an array of key string,
 * we return the object including both the "key" and the "typename".
 *
 * @see https://github.com/graphql/graphql-js/blob/9a91e338101b94fb1cc5669dd00e1ba15e0f21b3/src/jsutils/Path.ts#L23
 */
export function pathToArray(
  path: Readonly<GraphQLResolveInfo['path']> | undefined
): GraphQLResolveInfo['path'][] {
  const flattened = []
  let prev = path

  while (prev) {
    flattened.push(prev)
    prev = prev.prev
  }
  return flattened.reverse()
}
