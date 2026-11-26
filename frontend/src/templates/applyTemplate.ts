import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { insertDraft } from '../generate/board'
import { findTemplate } from './templates'

/** Adds the template's components and connections to the board. */
export function applyTemplate(
  api: ExcalidrawImperativeAPI,
  templateId: string,
): void {
  const template = findTemplate(templateId)
  if (!template) {
    console.warn(`No template called ${templateId}`)
    return
  }
  insertDraft(api, template)
}
