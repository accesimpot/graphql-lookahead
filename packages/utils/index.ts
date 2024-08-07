import path from 'node:path'

/**
 * Generate the input object expected by Rollup to preserve the src directory structure in the
 * dist directory.
 * @see https://rollupjs.org/configuration-options/#input
 *
 * @param preservedInputs - file paths relative to src directory
 * @param srcDir - absolute path to src directory
 */
export function getPreservedInputMapping(preservedInputs: string[], srcDir: string) {
  return Object.fromEntries(
    preservedInputs.map(filePath => [
      filePath.replace(/\.[mc]?[jt]s$/, ''),
      path.join(srcDir, filePath),
    ])
  )
}
