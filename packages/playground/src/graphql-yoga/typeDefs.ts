import fs from 'node:fs'
import { createRequire } from 'node:module'
import { parse } from 'graphql'

const require = createRequire(import.meta.url)

export const typeDefs = parse(fs.readFileSync(require.resolve('#src/schema.gql'), 'utf8'))
