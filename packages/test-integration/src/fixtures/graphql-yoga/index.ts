import { createServer } from 'node:http'
import { createSchema, createYoga } from 'graphql-yoga'
import { resolvers } from './resolvers'
import { typeDefs } from './typeDefs'
import { GRAPHQL_YOGA_PORT } from '../../constants'

const schema = createSchema({ typeDefs, resolvers })
const yoga = createYoga({ schema })
const server = createServer(yoga)

server.listen(GRAPHQL_YOGA_PORT, () => {
  console.info(`🚀 Server is running on http://localhost:${GRAPHQL_YOGA_PORT}/graphql`)
})
