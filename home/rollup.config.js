import fs from 'node:fs'

const npmDeps = fs.readdirSync('./build/external/pkg')
const external = npmDeps.map(file => `./external/pkg/${file}`)

export default {
  external,
  input: 'build/index.js',
  output: {
    file: 'build/bundle.js',
    format: 'esm'
  }
};
