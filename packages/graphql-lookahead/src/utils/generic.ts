import type { GraphQLType, GraphQLResolveInfo, SelectionSetNode, SelectionNode } from 'graphql'

/**
 * Given the info.path representing the location in the operation from where the resolver was
 * triggered, the function finds the selectionSet that matches that path.
 */
export function findSelectionSetForInfoPath(
  info: Pick<GraphQLResolveInfo, 'schema' | 'fragments' | 'path'> & {
    operation: Pick<GraphQLResolveInfo['operation'], 'selectionSet'>
  }
) {
  return findSelectionSetForPathArray({
    info,
    paths: pathToArray(info.path),
    pathIndex: 0,
    selectionSet: info.operation.selectionSet,
  })
}

function findSelectionSetForPathArray(options: {
  info: Pick<GraphQLResolveInfo, 'schema' | 'fragments'>
  paths: ReturnType<typeof pathToArray>
  pathIndex: number
  selectionSet: SelectionSetNode
}) {
  const currentSelectionPath: (typeof options.paths)[0] = options.paths[options.pathIndex]
  if (!currentSelectionPath) return

  const selectionSet = options.selectionSet

  let selectionMatch: (typeof selectionSet.selections)[0] | undefined
  let nextSelectionSetMatch: SelectionSetNode | undefined
  let nextPathIndexAddition = 1

  const findByName = (select: SelectionNode) => {
    if ('name' in select && select.name.value === currentSelectionPath.key) return select
  }

  for (const selection of selectionSet.selections) {
    const selectionName = findSelectionName(selection)

    // This should only happen if the selection is invalid
    if (!selectionName) continue

    const { isFragmentSelection, nextSelectionSet, selectionTypeName } = getSelectionDetails({
      info: options.info,
      selection,
      selectionName,
      type: currentSelectionPath.typename,
    })

    if (isFragmentSelection && selectionTypeName === currentSelectionPath.typename) {
      nextPathIndexAddition = 0

      if (nextSelectionSet && selection.kind === 'FragmentSpread') {
        selectionMatch = nextSelectionSet.selections.find(findByName)
      }
      if (selection.kind === 'InlineFragment') selectionMatch = selection
    }
    if (!isFragmentSelection) selectionMatch = findByName(selection)

    if (selectionMatch) {
      if (nextSelectionSet) nextSelectionSetMatch = nextSelectionSet
      break
    }
  }

  if (!nextSelectionSetMatch) return

  const nextPathIndex = options.pathIndex + nextPathIndexAddition
  if (nextPathIndex === options.paths.length) return nextSelectionSetMatch

  return findSelectionSetForPathArray({
    info: options.info,
    paths: options.paths,
    pathIndex: options.pathIndex + nextPathIndexAddition,
    selectionSet: nextSelectionSetMatch,
  })
}

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
 * Given a Path (taken from the resolver argument info.path), it returns an array of the path
 * object in the right order (from the query field to the most nested field).
 *
 * Inspired by `pathToArray` from 'graphql', but instead of returning only an array of key string,
 * it returns the object including both the "key" and the "typename". It also filters out the paths
 * with a key of type number (only relevant for retrieving the path in the data, not in the
 * operation selection).
 *
 * @see https://github.com/graphql/graphql-js/blob/9a91e338101b94fb1cc5669dd00e1ba15e0f21b3/src/jsutils/Path.ts#L23
 */
export function pathToArray(path: GraphQLResolveInfo['path'] | undefined) {
  const flattened = []
  let prev = path

  while (prev) {
    if (typeof prev.key === 'string') flattened.push({ key: prev.key, typename: prev.typename })
    prev = prev.prev
  }
  return flattened.reverse()
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
