import * as esbuild from 'esbuild'

const result = await esbuild.build({
  entryPoints: ['src/client/auth.tsx'],
  bundle: true,
  minify: true,
  format: 'esm',
  write: false,
  jsxImportSource: 'hono/jsx/dom',
  jsx: 'automatic',
  target: 'es2020',
})

const code = result.outputFiles[0].text
const escaped = code.replace(/`/g, '\\`').replace(/\$/g, '\\$')
const output = `export const clientScript = \`${escaped}\`\n`

await Bun.write('src/client/auth.js', output)
console.log('Client build complete: src/client/auth.js')
