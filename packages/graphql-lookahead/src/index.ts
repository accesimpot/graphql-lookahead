import type {
  OperationDefinitionNode,
  GraphQLSchema,
  GraphQLOutputType,
  GraphQLType,
  SelectionSetNode,
} from 'graphql'

type Handler<T> = (details: { parentState: T; typeName: string; fieldName: string }) => T

const QUERY_TYPE = 'Query'

export function lookahead<TState>(options: {
  info: { operation: OperationDefinitionNode; schema: GraphQLSchema; returnType: GraphQLOutputType }
  next: Handler<TState>
  state?: TState
}): void {
  const { operation, schema } = options.info

  /**
   * We need to let "lookDeeper" call itself in order to go deep inside every nested selections
   * inside the operation.
   */
  const lookDeeper = <TParentState extends TState>({
    parentTypeName,
    selectionSet,
    parentState,
  }: {
    parentTypeName: string
    selectionSet: SelectionSetNode
    parentState: TParentState
  }) => {
    // Get the definition of the parent type in order to get all its possible fields (getFields)
    const possibleTypeDefinition = schema.getType(parentTypeName)
    const typeDefinition = possibleTypeDefinition
      ? findTypeDefinition(possibleTypeDefinition)
      : undefined

    // This should never happen
    if (!typeDefinition) return

    const childFields = 'getFields' in typeDefinition ? typeDefinition.getFields() : undefined

    // Each selection represents a field or a fragment you're requesting inside the operation
    selectionSet.selections.forEach(selection => {
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
        const deeperArgs: Parameters<typeof lookDeeper>[0] = {
          parentTypeName: selectionTypeName,
          selectionSet: selection.selectionSet,
          parentState,
        }

        if (parentTypeName !== QUERY_TYPE) {
          deeperArgs.parentState = options.next({
            parentState,
            typeName: selectionTypeName,
            fieldName: selectionName,
          })
        }
        lookDeeper(deeperArgs)
      }
    })
  }

  lookDeeper({
    parentTypeName: QUERY_TYPE,
    selectionSet: operation.selectionSet,
    parentState: options.state as TState,
  })
}

function findTypeName(type: GraphQLType) {
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
function findTypeDefinition(type: GraphQLType) {
  const typeDefinition = ('ofType' in type ? findTypeDefinition(type.ofType) : type) as
    | GraphQLType
    | undefined

  if (typeDefinition && 'name' in typeDefinition) return typeDefinition
}
