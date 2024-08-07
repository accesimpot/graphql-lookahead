import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import graphql from '@rollup/plugin-graphql'
import { globSync } from 'glob'
import { getPreservedInputMapping } from 'utils'
import pkg from './package.json'

const ROOT_DIR = __dirname
const SRC_DIR = 'src'
const DIST_DIR = 'lib'
const ABSOLUTE_SRC = path.resolve(ROOT_DIR, SRC_DIR)

const entries = globSync('**/*.ts', { cwd: ABSOLUTE_SRC }).filter(
  // Exclude .d.ts and .spec.ts files
  filePath => !/\.(d|spec)\.ts$/.test(filePath)
)

const outputDir = path.resolve(ROOT_DIR, DIST_DIR)
const tsconfigPath = path.resolve(ROOT_DIR, 'tsconfig.compiler.json')

export default defineConfig({
  root: ROOT_DIR,
  resolve: {
    alias: { '@': ABSOLUTE_SRC },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
    preventAssignment: true,
  },

  plugins: [
    dts({
      tsconfigPath,
      outDir: outputDir,
      copyDtsFiles: true,
    }),
    graphql(),
  ],

  esbuild: {
    tsconfigRaw: fs.readFileSync(tsconfigPath, 'utf8'),
  },

  build: {
    outDir: outputDir,
    lib: {
      entry: getPreservedInputMapping(entries, ABSOLUTE_SRC),
      formats: ['es'],
    },
    sourcemap: true,
    emptyOutDir: true,
    dynamicImportVarsOptions: { exclude: '**/*' },

    rollupOptions: {
      output: {
        dir: outputDir,
        format: 'esm',
      },
      external: Object.keys(pkg.dependencies || {}),
    },
  },
})
