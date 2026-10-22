# Live editing protocol

This page describes how browsers and the Go server exchange board changes. The
message format will be added with the server's WebSocket work (#26). If the
format or the rule below needs to change, change this page in a PR and tag the
owners of #26, #27, #28 and #29.

## Which edit wins

Two people can change the same shape at the same moment. Every browser, and
later the server, must pick the same winner, or people end up looking at
different boards.

We use Excalidraw's own rule. For each shape id, compare the two copies:

1. The copy with the higher `version` wins. Excalidraw adds one to a shape's
   `version` every time it changes.
2. If the versions are equal, the copy with the lower `versionNonce` wins.
   `versionNonce` is a random number that changes with every edit, so this is
   just a fixed tie-breaker.
3. A deleted shape is still a copy (`isDeleted: true`) and follows the same
   rule. A delete can lose to an edit with a higher `version`.

Because every copy of the board applies the same rule, all copies end up the
same no matter what order messages arrive in.

### What this means for users

The winner is the copy that was **edited more**, not the one edited **last**.
If Alice drags a box for a few seconds (many version bumps) while Bob changes
its color once, Alice's copy wins and Bob's color change is lost, even if Bob
clicked last. This is how excalidraw.com behaves, and it is rare in practice
because people seldom edit the same shape at the same time.

### Why not "the change that reaches the server last wins"?

The server passes each change to everyone else and never sends your own change
back to you. Each browser has already shown its own edit, so "last" would mean
"last to arrive at this browser", which is different for each person. In the
example above, Alice would end up seeing Bob's color and Bob would see Alice's,
and their boards would never match again.

Making "last to reach the server" work would need the server to send every
change back to everyone in one fixed order, and each browser to undo its own
edit when the server's order puts someone else's after it. We may do that later
if the rule above surprises users.

### Where the rule lives

- Browsers: `mergeElements` in `frontend/src/realtime/sceneSync.ts` (#28).
- Server: when the server keeps its own copy of a board, it must use the same
  rule, so that saved boards match what people see.
