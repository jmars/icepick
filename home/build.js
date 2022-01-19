const { Volume } = require('memfs')
const fs = require('node:fs/promises')
const path = require('node:path')
const { install } = require('esinstall')
const { build } = require('esbuild')
// TODO: minification
const { terser } = require('rollup-plugin-terser')

async function main() {
  const package = require('./package.json')

  const { importMap, stats } = await install(Object.keys(package.dependencies), {
    rollup: {
      plugins: [terser()]
    }
  })

  console.log(importMap, stats)

  try {
    await fs.mkdir('build')
  } catch (e) {}

  const vol = Volume.fromJSON({ 'build/bundle.js': '' })
  const bundle = await vol.promises.open('build/bundle.js', 'w')
  const provides = {}
  const requires = {}
  const internal = {}

  const { outputFiles: [ mod ] } = await build({
    entryPoints: ['./src/index.ts'],
    bundle: true,
    external: Object.keys(package.dependencies),
    write: false,
    minify: true,
    format: 'esm'
  })

  await bundle.write(mod.contents)
  internal['./index.js'] = mod.contents.byteLength

  for (const file of Object.keys(stats.common)) {
    const content = await fs.readFile(path.join('web_modules', file))
    const { size: start } = await bundle.stat()
    await bundle.write(content)
    const { size: end } = await bundle.stat()
    internal[`./${file}`] = end - start
  }

  for (const [name, file] of Object.entries(importMap.imports)) {
    const content = await fs.readFile(path.join('web_modules', file))
    const { size: start } = await bundle.stat()
    await bundle.write(content)
    const { size: end } = await bundle.stat()
    const version = require(path.resolve('node_modules', name, 'package.json')).version
    provides[name] = [version, end - start]
    requires[name] = package.dependencies[name]
  }

  const meta = {
    exposes: './index.js',
    provides,
    internal,
    requires
  }

  const manifest = Buffer.from(JSON.stringify(meta, null, 2) + '}')
  const complete = await vol.promises.readFile('build/bundle.js')
  await fs.writeFile('build/bundle.js', Buffer.concat([manifest, complete]))
}

main()
