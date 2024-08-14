import type { Plugin } from 'graphql-yoga'

function sanitizeMetaData<T>(meta: T) {
  try {
    return JSON.parse(JSON.stringify(meta))
  } catch (_) {
    return {}
  }
}

export function useMetaPlugin(): Plugin {
  if (process.env.NODE_ENV === 'production') return {}

  return {
    onResultProcess(payload) {
      const meta = sanitizeMetaData(payload.request.metaData)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = payload.result as typeof payload.result & { extensions: Record<string, any> }
      result.extensions = { ...result.extensions, meta }
    },
  }
}
