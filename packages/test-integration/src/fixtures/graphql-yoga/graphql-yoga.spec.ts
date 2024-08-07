import { createSchema, createYoga } from 'graphql-yoga'
import { buildHTTPExecutor } from '@graphql-tools/executor-http'
import { resolvers } from './resolvers'
import { typeDefs } from './typeDefs'
import { getFixtureQuery } from '../../utils/graphql'
import type { GraphqlResponse } from '../../utils/types'

describe('graphql-yoga', () => {
  const schema = createSchema({ typeDefs, resolvers })
  const yoga = createYoga({ schema })
  const executor = buildHTTPExecutor({ fetch: yoga.fetch })

  const execute = async (opts: Parameters<typeof executor>[0]) => {
    return (await executor(opts)) as GraphqlResponse
  }

  describe('when it sends cart query', async () => {
    const result = await execute({
      document: getFixtureQuery('graphql-yoga/queries/cart.gql'),
    })

    it('returns order total', () => {
      expect(result.data?.order.total).toBe(25)
    })
  })
})
