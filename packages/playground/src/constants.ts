import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ABSOLUTE_ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const ABSOLUTE_SRC_DIR = path.join(ABSOLUTE_ROOT_DIR, 'src')

export const GRAPHQL_YOGA_PORT = 4455
