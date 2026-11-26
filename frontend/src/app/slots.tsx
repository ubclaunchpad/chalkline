// Integrator-owned. Each area fills in its own components; don't edit this file.
import { AssistantButton, AssistantPanel } from '../assistant'
import { ChecksButton, ChecksLayer, ChecksPanel } from '../checks'
import {
  CommentPins,
  CommentsButton,
  CommentsPanel,
  ShareButton,
} from '../collab'
import { ElementEffects } from '../elements'
import { ExportMenu } from '../export'
import { PracticeButton, PracticePanel } from '../practice'
import { Inspector } from '../properties/Inspector'
import { ReviewButton, ReviewPanel } from '../review'
import { EmptyState } from '../shell/EmptyState'
import { FloatingToolbar } from '../shell/FloatingToolbar'
import { ShapeActionsGuard } from '../shell/ShapeActionsGuard'
import { ZoomControls } from '../shell/ZoomControls'

/** Buttons in the top bar, left to right. */
export function TopBarActions() {
  return (
    <>
      <AssistantButton />
      <ChecksButton />
      <ReviewButton />
      <PracticeButton />
      <CommentsButton />
      <ExportMenu />
      <ShareButton />
    </>
  )
}

/** Right-side panels. Each renders only when its panel id is open. */
export function RightPanels() {
  return (
    <>
      <Inspector />
      <ChecksPanel />
      <ReviewPanel />
      <AssistantPanel />
      <CommentsPanel />
      <PracticePanel />
    </>
  )
}

/** Things drawn over the canvas: toolbar, overlays, empty state. */
export function CanvasLayers() {
  return (
    <>
      <ElementEffects />
      <ShapeActionsGuard />
      <ChecksLayer />
      <CommentPins />
      <EmptyState />
      <FloatingToolbar />
      <ZoomControls />
    </>
  )
}
