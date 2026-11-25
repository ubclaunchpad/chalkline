// Groups validator problems by the field they belong to, so the panel can show
// each one next to its input. Every validator message starts with the field's
// key, e.g. 'replicas must be at least 1' or 'name is required'.
//
// Problems that are not about a field (such as 'element is not a component')
// end up under words no input uses, so the panel does not show them.
export function fieldErrors(
  problems: readonly string[],
): Record<string, string> {
  const errors: Record<string, string> = {}

  for (const problem of problems) {
    const field: string = problem.split(' ')[0]
    // Keep the first problem for a field; one message per input is enough.
    if (!Object.hasOwn(errors, field)) {
      errors[field] = problem
    }
  }

  return errors
}
