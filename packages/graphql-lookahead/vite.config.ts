import { generateViteConfig } from 'dev-utils'

export default generateViteConfig({
  absoluteRootDir: __dirname,
  pluginCategories: ['dts'],
  formats: ['es', 'cjs'],
})
