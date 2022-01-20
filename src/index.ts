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
const bundles: Record<string, Bundle> = {}
const packages: Record<string, Array<[string, PromiseLike<any>]>> = {}
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
  if (bundles[path]) {
    return bundles[path]
  }

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

// TODO: handle whole response
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

async function im(path: string) {
  const file = new URL(path, location.origin)
  const dir = new URL(file.pathname.split('/').slice(0, -1).join('/'), location.origin)
  const bundle = await getManifest(file.toString());
  const { exposes, provides, internal } = bundle

  for (const [name, size] of Object.entries(internal)) {
    const origin = new URL([dir, name].join('/'), dir).toString()
    const offset = bundle.offsets[name]

    __shimport__.promises[origin] = {
      async then(fn: any) {
        const pending = new Promise(async (resolve) => {
          const mod = await getRange(file.toString(), offset, size)
          const transformed = __shimport__.transform(mod, origin)
          const exp = await (new Function('return ' + transformed))();
          resolve(exp)
        })
        __shimport__.promises[origin] = pending
        return pending.then(fn)
      }
    }
  }

  for (const [name, meta] of Object.entries(provides)) {
    const [version, size] = meta
    const origin = new URL([dir, name].join('/'), dir).toString()
    const offset = bundle.offsets[name]

    packages[name] = packages[name] || []
    const index = packages[name].push([version, {
      then(fn: any) {
        const pending = new Promise(async (resolve) => {
          const mod = await getRange(file.toString(), offset, size)
          const transformed = __shimport__.transform(mod, origin)
          const exp = await (new Function('return ' + transformed))();
          resolve(exp)
        })
        packages[name][index - 1] = [version, pending]
        return pending.then(fn)
      }
    }])

    const required = bundle.requires[name]

    __shimport__.promises[origin] = {
      then(fn: any) {
        for (const [version, promise] of packages[name]) {
          if (satisfies(version, required)) {
            __shimport__.promises[origin] = promise
            return promise.then(fn)
          }
          throw new Error(`Unable to find valid module for ${name}`)
        }
      }
    }
  }

  (await import(`/home/${exposes.replace('./', '')}` as string)).default()
}

async function init() {
}

im('/home/bundle.js')

export default init()
