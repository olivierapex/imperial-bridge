import { registerHooks } from 'node:module'

// The mod sources import each other without extensions; Node needs the extension.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.')) return nextResolve(`${specifier}.ts`, context)
      throw error
    }
  },
})
