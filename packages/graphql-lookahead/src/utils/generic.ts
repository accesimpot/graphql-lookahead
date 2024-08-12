import type { GraphQLType } from 'graphql'

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
