import {
  type GraphQLResolveInfo,
  type GraphQLField,
  type GraphQLInputField,
  isListType,
  isNonNullType,
} from 'graphql'
import { findTypeName, getChildFields } from './generic'

const ERROR_PREFIX = '[graphql-lookahead]'

/** Resolve path step (`GraphQLResolveInfo['path']`). */
export type ResolvePath = NonNullable<GraphQLResolveInfo['path']>

/**
 * Details passed to `until` / `next` while walking ancestor fields via `info.path`.
 *
 * Unlike `lookahead` handlers, there is no selection AST node or argument map here — the resolve
 * `Path` only carries field names, owning types, and list indices. Fragments never appear on the
 * path (only resolved fields do).
 */
export type PrevHandlerDetails<TState> = {
  info: GraphQLResolveInfo
  /**
   * Ancestor field name (`path.key` when it is a string).
   */
  field: string
  fieldDef: GraphQLField<any, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  /**
   * Whether or not the ancestor field type is a GraphQL List (`[Foo!]` is a list, `Foo!` is not).
   */
  isList: boolean
  /**
   * Present when the step below this ancestor was a list index (`path.key` was a number).
   * For `items[1].product`, the `items` step gets `listIndex: 1`.
   */
  listIndex?: number
  /**
   * Resolve path step for this ancestor (string `key`).
   */
  path: ResolvePath
  /**
   * GraphQL type that owns `field` (`path.typename`).
   */
  sourceType: string
  state: TState
  /**
   * Return type name of `field` (from the schema).
   */
  type: string
}

export type UntilPrevHandlerDetails<TState> = PrevHandlerDetails<TState>

export type UntilPrevHandlerDetailsReturn<TState> =
  | boolean
  | { afterAllParents: (details: UntilPrevHandlerDetails<TState>) => void }

/**
 * Use `lookbehind` to check within the resolver function whether particular **parent** fields
 * are on the resolve path (`info.path`). This walks the other direction from `lookahead`
 * (which inspects child selections).
 *
 * Starts at `info.path.prev` (the immediate parent), not the current field — symmetric with
 * `lookahead`, which starts at child fields rather than the resolver field itself.
 *
 * Inline fragments, fragment spreads, and untyped inline fragments do **not** appear as steps:
 * GraphQL’s resolve path only contains field names and list indices. Resolvers nested inside
 * those fragments still see the correct parent field chain.
 *
 * @param options.depth - How many parent fields to visit (`depth: 1` is the immediate parent,
 *   `depth: null` is no limit). Default: `depth: null`.
 * @param options.info - GraphQLResolveInfo object which is usually the fourth argument of the
 *   resolver function.
 * @param options.next - Handler called for every ancestor field. It can return a state that will
 *   be passed to the next (higher) parent’s handlers.
 * @param options.onError - Hook called from a `try..catch` when an error is caught. Default:
 *   `(err: unknown) => { console.error(ERROR_PREFIX, err); return true }`.
 * @param options.state - Initial state passed to `next` (and nested upward calls).
 * @param options.until - Handler called for every ancestor field. Returning true will stop the
 *   iteration and make `lookbehind` return true as well.
 */
export function lookbehind<TState, RError extends boolean | undefined>(options: {
  depth?: number | null
  info: GraphQLResolveInfo
  next?: (details: PrevHandlerDetails<TState>) => TState
  onError?: (err: unknown) => RError
  state?: TState
  until?: (details: UntilPrevHandlerDetails<TState>) => UntilPrevHandlerDetailsReturn<TState>
}): boolean {
  try {
    return lookbehindAndThrow(options)
  } catch (err) {
    /**
     * Return true and log all errors instead of throwing them since `lookbehind` is only used for
     * performance / conditional logic so you should rather proceed when there is a runtime error
     * (it can come from your handlers). If you need `lookbehind` to throw on error, use
     * `lookbehindAndThrow` directly.
     *
     * If `options.onError` is provided and return a boolean, it will be used as the return value
     * of `lookbehind` instead of the default value (`true`).
     */
    if (options.onError) {
      const returnValueOnError = options.onError(err)
      if (typeof returnValueOnError === 'boolean') return returnValueOnError
    } else {
      console.error(ERROR_PREFIX, err)
    }
    return true
  }
}

export function lookbehindAndThrow<TState>(options: {
  depth?: number | null
  info: GraphQLResolveInfo
  next?: (details: PrevHandlerDetails<TState>) => TState
  state?: TState
  until?: (details: UntilPrevHandlerDetails<TState>) => UntilPrevHandlerDetailsReturn<TState>
}): boolean {
  const state = options.state as TState

  return lookHigherAndThrow({
    depth: options.depth,
    info: options.info,
    next: options.next,
    path: options.info.path.prev,
    state,
    until: options.until,
  })
}

/**
 * Iterate over every ancestor field of the provided resolve `path` (typically `info.path.prev`).
 * You can stop the iteration using the `until` option.
 *
 * Numeric path keys (list indices) are skipped as their own steps and exposed as `listIndex` on
 * the next ancestor field above them.
 *
 * @param options.depth - How many parent fields to visit (`depth: 1` is the first ancestor,
 *   `depth: null` is no limit). Default: `depth: null`.
 * @param options.info - GraphQLResolveInfo object used for schema lookups.
 * @param options.next - Handler called for every ancestor field. It can return a state that will
 *   be passed to the next (higher) parent’s handlers.
 * @param options.onError - Hook called from a `try..catch` when an error is caught. Default:
 *   `(err: unknown) => { console.error(ERROR_PREFIX, err); return true }`.
 * @param options.path - Resolve path to start from (usually `info.path.prev`). `undefined` means
 *   there is no parent (e.g. a root field resolver).
 * @param options.state - Initial state passed to `next` (and nested upward calls).
 * @param options.until - Handler called for every ancestor field. Returning true will stop the
 *   iteration and make `lookHigher` return true as well.
 */
export function lookHigher<TState, RError extends boolean | undefined>(options: {
  depth?: number | null
  info: GraphQLResolveInfo
  next?: (details: PrevHandlerDetails<TState>) => TState
  onError?: (err: unknown) => RError
  path: ResolvePath | undefined
  state: TState
  until?: (details: UntilPrevHandlerDetails<TState>) => UntilPrevHandlerDetailsReturn<TState>
}): boolean {
  try {
    return lookHigherAndThrow(options)
  } catch (err) {
    /**
     * Return true and log all errors instead of throwing them since `lookHigher` is only used for
     * performance / conditional logic so you should rather proceed when there is a runtime error
     * (it can come from your handlers). If you need `lookHigher` to throw on error, use
     * `lookHigherAndThrow` directly.
     *
     * If `options.onError` is provided and return a boolean, it will be used as the return value
     * of `lookHigher` instead of the default value (`true`).
     */
    if (options.onError) {
      const returnValueOnError = options.onError(err)
      if (typeof returnValueOnError === 'boolean') return returnValueOnError
    } else {
      console.error(ERROR_PREFIX, err)
    }
    return true
  }
}

export function lookHigherAndThrow<TState>(options: {
  depth?: number | null
  info: GraphQLResolveInfo
  next?: (details: PrevHandlerDetails<TState>) => TState
  path: ResolvePath | undefined
  state: TState
  until?: (details: UntilPrevHandlerDetails<TState>) => UntilPrevHandlerDetailsReturn<TState>
}): boolean {
  const depth: number | null = typeof options.depth === 'number' ? options.depth : null
  const next: NonNullable<typeof options.next> = options.next || (({ state }) => state)
  const until: NonNullable<typeof options.until> = options.until || (() => false)

  return !!lookHigherWithDefaults({ ...options, depth, depthIndex: 0, next, until })
}

function lookHigherWithDefaults<TState>(options: {
  depth: number | null
  depthIndex: number
  info: GraphQLResolveInfo
  next: (details: PrevHandlerDetails<TState>) => TState
  path: ResolvePath | undefined
  state: TState
  until: (details: UntilPrevHandlerDetails<TState>) => UntilPrevHandlerDetailsReturn<TState>
}): boolean | void {
  const afterAllParentsHooks: (() => void)[] = []

  let path = options.path
  let state = options.state
  let depthIndex = options.depthIndex
  let pendingListIndex: number | undefined

  while (path) {
    if (typeof path.key === 'number') {
      pendingListIndex = path.key
      path = path.prev
      continue
    }

    const sourceType = path.typename

    // Missing typename should only happen for unexpected / synthetic paths — skip the step.
    if (!sourceType) {
      pendingListIndex = undefined
      path = path.prev
      continue
    }

    const field = path.key
    const siblingFields = getChildFields(options.info.schema, sourceType)
    const rawFieldDef = siblingFields?.[field]

    // Invalid path / schema mismatch — skip rather than throw mid-walk.
    if (!rawFieldDef) {
      pendingListIndex = undefined
      path = path.prev
      continue
    }

    // Object types expose GraphQLField (not GraphQLInputField).
    const fieldDef = rawFieldDef as Exclude<typeof rawFieldDef, GraphQLInputField>
    const type = findTypeName(fieldDef.type)

    if (!type) {
      pendingListIndex = undefined
      path = path.prev
      continue
    }

    const listIndex = pendingListIndex
    pendingListIndex = undefined

    const handlerArgs: PrevHandlerDetails<TState> = {
      info: options.info,
      field,
      fieldDef,
      get isList() {
        const fieldType = this.fieldDef.type
        return isListType(fieldType) || (isNonNullType(fieldType) && isListType(fieldType.ofType))
      },
      ...(listIndex !== undefined ? { listIndex } : {}),
      path,
      sourceType,
      state,
      type,
    }

    const untilReturnValue = options.until(handlerArgs)

    if (untilReturnValue) {
      if (typeof untilReturnValue === 'object') {
        afterAllParentsHooks.push(() => untilReturnValue.afterAllParents(handlerArgs))
      } else {
        return true
      }
    }

    state = options.next(handlerArgs)

    depthIndex += 1
    if (options.depth !== null && depthIndex >= options.depth) break

    path = path.prev
  }

  afterAllParentsHooks.forEach(hook => hook())
}
