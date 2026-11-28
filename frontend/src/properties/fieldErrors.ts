// Groups validator problems by their leading field key, with the key removed
// ('replicas must be at least 1' -> replicas: 'must be at least 1').
export function fieldErrors(
  problems: readonly string[],
): Record<string, string> {
  const errors: Record<string, string> = {}

  for (const problem of problems) {
    const space: number = problem.indexOf(' ')
    const field: string = space === -1 ? problem : problem.slice(0, space)
    const message: string = space === -1 ? problem : problem.slice(space + 1)
    // Keep the first problem for a field; one message per input is enough.
    if (!Object.hasOwn(errors, field)) {
      errors[field] = message
    }
  }

  return errors
}
