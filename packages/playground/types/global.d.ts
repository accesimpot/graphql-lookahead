declare global {
  interface Request {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metaData?: any
  }
}
export {}
