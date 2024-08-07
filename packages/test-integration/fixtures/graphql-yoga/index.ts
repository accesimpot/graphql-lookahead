import { createServer } from 'node:http'
import { createSchema, createYoga } from 'graphql-yoga'
import typeDefs from './typeDefs.gql'
import { resolvers } from './resolvers'

const PORT = 4000

const schema = createSchema({ typeDefs, resolvers })
const yoga = createYoga({ schema })
const server = createServer(yoga)

server.listen(PORT, () => {
  console.info(`🚀 Server is running on http://localhost:${PORT}/graphql`)
})
