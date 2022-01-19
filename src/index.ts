import satisfies from 'semver/functions/satisfies'
// @ts-expect-error no types
import njsp from 'nano-json-stream-parser'
// @ts-expect-error no types
import concatTypedArray from "concat-typed-array"

interface Bundle {
  exposes: string;
  provides: Record<string, [string, number]>;
  internal: Record<string, number>;
  requires: Record<string, string>;
  offsets: Record<string, number>;
}

declare global {
  var __shimport__: any;
}

const vfs: Record<string, ArrayBuffer> = {}
const decoder = new TextDecoder()
const encoder = new TextEncoder()

function setOffsets(bundleLength: number, bundle: Bundle) {
  bundle.offsets = bundle.offsets || {}
  let i = bundleLength

  bundle.offsets[bundle.exposes] = i
  i += bundle.internal[bundle.exposes]

  for (const [name, size] of Object.entries(bundle.internal).filter(([m, _]) => m !== bundle.exposes)) {
    bundle.offsets[name] = i
    i += size
  }

  for (const [name, range] of Object.entries(bundle.provides)) {
    const [_, size] = range
    bundle.offsets[name] = i
    i += size
  }
}

async function getManifest(path: string): Promise<Bundle> {
  const controller = new AbortController()
  const signal = controller.signal
  const manifest = await fetch(path, { signal }).then(res => res.body?.getReader())

  if (!manifest) {
    throw new Error("Unable to get bundle")
  }

  return new Promise(async (resolve, _) => {
    let run = true
    const blobs: Uint8Array[] = []

    const parse = njsp((json: Bundle) => {
      controller.abort()
      run = false
      vfs[path] = concatTypedArray(Uint8Array, ...blobs).buffer
      const bundleLength = encoder.encode(JSON.stringify(json, null, 2)).byteLength + 1
      setOffsets(bundleLength, json)
      resolve(json)
    });

    while (run) {
      const blob = (await manifest.read()).value

      if (!blob) {
        throw new Error('Failed to parse manifest')
      }

      blobs.push(blob)
      parse(decoder.decode(blob))
    }
  })
}

async function getRange(path: string, offset: number, size: number): Promise<string> {
  const buffer = vfs[path]
  const end = offset + size - 1

  if (end <= buffer.byteLength) {
    const chunk = new Uint8Array(buffer, offset, size)
    const mod = decoder.decode(chunk)
    return mod
  } else {
    const mod = await fetch(path, {
      method: 'GET',
      headers: {
        Range: `bytes=${offset}-${end}`
      }
    }).then(res => res.text())
    return mod
  }
}

async function init() {
  const bundle = '/home/bundle.js'
  const manifest = await getManifest(bundle)

  const { exposes, provides, internal } = manifest
  console.log(satisfies('1.2.3', '^1.2.0'))

  for (const [name, size] of Object.entries(internal)) {
    const origin = `${location.origin}/home/${name.replace('./', '')}`
    const offset = manifest.offsets[name]

    __shimport__.promises[origin] = {
      async then(fn: (arg0: string) => void) {
        const mod = await getRange(bundle, offset, size)
        const transformed = __shimport__.transform(mod, origin)
        const exp = await (new Function('return ' + transformed))();
        __shimport__.promises[origin] = Promise.resolve(exp);
        fn(exp)
      }
    }
  }

  for (const [name, meta] of Object.entries(provides)) {
    const [_, size] = meta
    const origin = `${location.origin}/home/${name.replace('./', '')}`
    const offset = manifest.offsets[name]

    __shimport__.promises[origin] = {
      async then(fn: (arg0: string) => void) {
        const mod = await getRange(bundle, offset, size)
        const transformed = __shimport__.transform(mod, origin)
        const exp = await (new Function('return ' + transformed))();
        __shimport__.promises[origin] = Promise.resolve(exp);
        fn(exp)
      }
    }
  }

  (await import(`/home/${exposes.replace('./', '')}` as string)).default()
}

export default init()
