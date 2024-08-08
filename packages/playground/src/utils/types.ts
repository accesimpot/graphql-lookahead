// Safe to use type "any" for tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GraphqlResponse<T = Record<string, any> | null> = {
  data?: T
  error?: Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
}
