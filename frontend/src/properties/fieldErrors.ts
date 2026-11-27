// Groups validator problems by the field they belong to, so the panel can show
// each one next to its input. Every validator message starts with the field's
// key, e.g. 'replicas must be at least 1' or 'name is required'.
//
// The key is removed from the message ('must be at least 1'): the message sits
// under the input's own label, and users should not see code names such as
// 'ttlSeconds'.
//
// Problems that are not about a field (such as 'element is not a component')
// end up under words no input uses, so the panel does not show them.
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
