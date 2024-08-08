import fs from 'node:fs'
import path from 'node:path'
import { globSync } from 'glob'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import graphql from '@rollup/plugin-graphql'

const SRC_DIR = 'src'
const DIST_DIR = 'dist'

export function generateViteConfig(options: {
  absoluteRootDir: string
  srcDir?: string
  distDir?: string
}) {
  const { absoluteRootDir, srcDir = SRC_DIR, distDir = DIST_DIR } = options

  const absoluteSrcDir = path.resolve(absoluteRootDir, srcDir)
  const absoluteDistDir = path.resolve(absoluteRootDir, distDir)

  const tsconfigPath = path.resolve(absoluteRootDir, 'tsconfig.compiler.json')

  return defineConfig({
    root: absoluteRootDir,
    resolve: {
      alias: { '@': absoluteSrcDir },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
      preventAssignment: true,
    },

    plugins: [
      dts({
        tsconfigPath,
        outDir: absoluteDistDir,
        copyDtsFiles: true,
      }),
      graphql(),
    ],

    esbuild: {
      tsconfigRaw: fs.readFileSync(tsconfigPath, 'utf8'),
    },

    build: {
      outDir: absoluteDistDir,
      lib: {
        entry: getPreservedInputMapping(absoluteSrcDir),
        formats: ['es'],
      },
      sourcemap: true,
      emptyOutDir: true,
      dynamicImportVarsOptions: { exclude: '**/*' },

      rollupOptions: {
        output: {
          dir: absoluteDistDir,
          format: 'esm',
        },
        external: [...getDependenciesFromPackageJson(absoluteRootDir), /^node:/],
      },
    },
  })
}

/**
 * Generate the input object expected by Rollup to preserve the src directory structure in the
 * dist directory.
 * @see https://rollupjs.org/configuration-options/#input
 *
 * @param absoluteSrcDir - absolute path to src directory
 */
function getPreservedInputMapping(absoluteSrcDir: string) {
  const entries = globSync('**/*.ts', { cwd: absoluteSrcDir }).filter(
    // Exclude .d.ts and .spec.ts files
    filePath => !/\.(d|spec)\.ts$/.test(filePath)
  )
  return Object.fromEntries(
    entries.map(filePath => [
      filePath.replace(/\.[mc]?[jt]s$/, ''),
      path.join(absoluteSrcDir, filePath),
    ])
  )
}

function getDependenciesFromPackageJson(absoluteRootDir: string): string[] {
  const pkgJsonFilePath = path.join(absoluteRootDir, 'package.json')
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonFilePath, 'utf-8')) as {
    dependencies: Record<string, string>
    devDependencies: Record<string, string>
  }
  return Object.keys({ ...pkgJson.dependencies, ...pkgJson.devDependencies })
}
