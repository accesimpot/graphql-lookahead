import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'graphql'
import { ABSOLUTE_SRC_DIR } from '../constants'

export function getFixtureQuery(filePath: string) {
  return parse(fs.readFileSync(path.resolve(ABSOLUTE_SRC_DIR, `./${filePath}`), 'utf8'))
}
