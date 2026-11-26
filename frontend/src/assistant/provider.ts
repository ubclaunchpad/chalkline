// The assistant's "brain" sits behind this interface so a real model could be
// swapped in later. That needs approval and an access-control design first
// (CLAUDE.md), so the only provider runs fixed rules in the browser.
import type { Draft } from '../generate/board'
import { explainGraph } from '../generate/explain'
import { parseDescription } from '../generate/parse'
import { suggestNextSteps, type Suggestion } from '../generate/suggest'
import type { Graph } from '../graph/deriveGraph'

export interface AssistantProvider {
  label: string
  draft(description: string): Draft
  explain(graph: Graph): string[]
  suggest(graph: Graph): Suggestion[]
}

export const localProvider: AssistantProvider = {
  label: 'Local rules',
  draft: parseDescription,
  explain: explainGraph,
  suggest: suggestNextSteps,
}
