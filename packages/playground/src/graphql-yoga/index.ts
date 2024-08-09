import { createServer } from 'node:http'
import { createSchema, createYoga } from 'graphql-yoga'
import { resolvers } from './resolvers'
import { typeDefs } from './typeDefs'
import { GRAPHQL_YOGA_PORT } from '../constants'
import { useMetaPlugin } from './plugins/useMetaPlugin'

const schema = createSchema({ typeDefs, resolvers })
const yoga = createYoga({ schema, plugins: [useMetaPlugin()] })
const server = createServer(yoga)

server.listen(GRAPHQL_YOGA_PORT, () => {
  console.info(`\n🚀 Server is running on http://localhost:${GRAPHQL_YOGA_PORT}/graphql\n`)
})
