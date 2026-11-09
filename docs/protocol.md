# Live editing protocol

This page describes how browsers and the Go server exchange board changes. If
the format or the rule below needs to change, change this page in a PR and tag the
owners of #26, #27, #28 and #29.

## Connections and messages

Each tab connects once at `/ws?board=<boardId>`. One connection belongs to one
room; clients with the same board ID share the same in-memory room. Before
upgrading, the server requires a valid UTF-8 board ID with 1–64 Unicode code
points; otherwise it returns HTTP 400. IDs are used exactly as supplied, without
trimming or normalization. Default WebSocket origin checks remain enabled.

The server sends `{"type":"welcome","clientId":"c_..."}` first, then exactly
one `snapshot` of the room's board (see [Joining a board](#joining-a-board)).
Each room keeps its own copy of the board in memory and judges every change
against it (see [Sending changes](#sending-changes)). Accepted messages go to
everyone else in the room with a trusted `from` field. The only message sent
back to the sender about its own change is a correction or an error. On
disconnect the server sends `{"type":"leave","clientId":"c_..."}` to the
remaining clients. It deletes an empty room together with its board.
Reconnecting creates a new client ID and receives a fresh snapshot.

Browser messages are UTF-8 JSON objects sent as WebSocket text messages:

```json
{"type":"change","elements":[],"batchId":"optional"}
{"type":"cursor","x":120.5,"y":88,"name":"Kathy","color":"#e03131"}
```

The envelope must be a JSON object whose exact `type` is `change` or `cursor`.
Unknown top-level fields are preserved. Every forwarded message has
`"from":"c_..."` set from the connection, replacing any browser-supplied value.
This is a connection identity, not authentication or board access control.

A `change` must have an `elements` array. Each element must be a JSON object,
with keys matched exactly and case-sensitively:

- `id`: a string of 1–64 code points, appearing at most once per change.
- `version` and `versionNonce`: plain whole numbers from 0 to 9007199254740991
  (2^53−1), with no sign, decimal point, exponent or quotes.
- `isDeleted`: `true` or `false`.

All other element fields are stored and forwarded as received. An optional
top-level `batchId` must be a string of 1–64 code points.

Incoming messages may contain at most 1 MiB (1,048,576 bytes), including JSON
whitespace and before adding `from`. A rejected message gets an error and is not
forwarded:

```json
{"type":"error","code":"invalid_element","message":"...","elementId":"x","batchId":"b1"}
```

| `code` | When | `message` |
|---|---|---|
| `invalid_message` | not text, not a JSON object, unknown `type`, or invalid `batchId` | `message must be text JSON`, `message must be a JSON object`, `message type must be change or cursor`, `batchId must be a string of 1 to 64 characters` |
| `message_too_large` | more than 1 MiB | `message too large` |
| `invalid_element` | an element breaks a rule above | `elements must be an array`, `element must be a JSON object`, `element id must contain 1 to 64 characters`, `version and versionNonce must be whole numbers from 0 to 9007199254740991`, `isDeleted must be true or false`, `element id appears twice in one change` |
| `conflict` | same `version` and `versionNonce` as the room's copy, different content | `same version and versionNonce with different content` |
| `board_full` | the change would grow the board past its limit | `board is full` |

`elementId` is set for `conflict`, and for `invalid_element` when the element's
`id` is a string. `batchId` echoes the change's `batchId`, unless the server
could not read it (`message_too_large`, malformed JSON, or an invalid `batchId`).
The connection stays open after these errors. Oversized messages are read with
bounded buffering and their remaining bytes discarded before reading the next
message. WebSocket protocol errors and network failures can still close the
connection.

Each client has a reader and a writer, connected to its room by a bounded
outgoing queue of 64 messages. A full queue cancels that connection rather than
blocking other participants or silently discarding edits. Writes have a
10-second timeout. Cancellation stops both loops without closing the outgoing
channel, avoiding sends to a closed channel during concurrent broadcasts.
Server shutdown also cancels active connections. A reconnecting client receives
the room's snapshot; how the browser catches up is #51.

## Joining a board

```json
{"type":"welcome","clientId":"c_..."}
{"type":"snapshot","elements":[ ... ]}
```

The snapshot holds every element the room has accepted, deleted elements
included (`isDeleted: true`), sorted by `id`. An empty room sends `[]`. It is
queued under the room lock before the client can receive broadcasts. So every
accepted change is either in the snapshot or arrives after it, exactly once.
Receiving the snapshot means the initial transfer is complete.

**Board size limit.** Every server message built from the board must fit in
1 MiB. The board size is counted as the longest such message:
`{"type":"change","from":"server","elements":[` plus every stored element plus
commas plus `]}`.

- A change that adds a new element ID is rejected with `board_full` once the
  board would pass 1,048,576 − 65,536 = 983,040 bytes.
- A change that only edits existing elements may grow the board up to
  1,048,576 bytes.
- A change that keeps the board the same size or smaller is always accepted,
  including deletes.

The 64 KiB of headroom exists because ordinary edits change an element's length
by a few bytes; a new random `versionNonce` can gain or lose a digit. A deleted
element keeps every field, so deleting frees almost nothing (a 575-byte
rectangle becomes a 573-byte tombstone). Measured on generated boards, 1 MiB
holds about 300 labeled boxes and 600 arrows. A forwarded change can be about
40 bytes over 1 MiB, because the server adds `from`.

**What #51 must do with the snapshot:**

1. Stay read-only ("catching up") until a valid `snapshot` arrives. Never
   become editable from an invalid or incomplete transfer.
2. Merge the snapshot into the local board; never replace the board with it.
   Then send back every local element that beats the snapshot. Rooms are
   memory-only until #48, so after a room empties the server's copy can be
   partial, and this is how it is refilled.
3. If the snapshot arrives before the editor is ready, hold it until it can be
   applied.

## Sending changes

The room compares each element in a `change` with its own copy, using the rule
in [Which edit wins](#which-edit-wins):

| Outcome | When | What the browser sees |
|---|---|---|
| Accepted | the element wins | nothing; others receive a `change` with only the winning elements |
| Duplicate | same `version`, `versionNonce` and content | nothing |
| Lost | the room's copy wins | a `change` with `"from":"server"` holding the room's copy |
| Rejected | an error from the table above | an `error`; the whole change is dropped and the board is unchanged |

A change where nothing wins is not forwarded. Today's browser applies a
correction like any other `change`; #51 can recognize one by
`from === "server"`. A browser that numbers its batches with `batchId` can tell
which one an error refers to.

## Known limits

- **Blank canvas until #51:** today's browser ignores `snapshot`.
- **A rejected change is lost for everyone else:** one bad element rejects its
  whole batch, and today's browser ignores `error` and never re-sends.
- **A full board stays full:** deletes free almost nothing, so a board at the
  new-element limit takes no new shapes while the room lives.
- **The room's copy can be partial:** it is deleted when the room empties or
  the server restarts, until #51 re-sends local boards and #48 saves them.

The tests cover these observable scenarios:

```gherkin
Scenario: Participants exchange messages within a board
  Given Alice, Bob, and Carol are on board a and Dan is on board b
  When Alice and Bob send messages
  Then the other participants on board a receive those messages
  And no sender receives its own message
  And Dan receives no messages from board a

Scenario: A participant disconnects
  Given Alice and Bob are on the same board
  When Alice disconnects
  Then Bob receives one leave message identifying Alice
  And Bob can keep exchanging messages with another participant
  When all participants disconnect
  Then the room is removed

Scenario: An invalid message does not interrupt collaboration
  Given Alice and Bob are on the same board
  When Alice sends malformed JSON, an unsupported type, binary data, or more than 1 MiB
  Then Alice receives an error and Bob receives none of that message
  And Alice can still send an accepted message to Bob on the same connection
```

The room's board is also covered (`server/internal/realtime/room_scene_test.go`):

- A late joiner's snapshot holds every shape, deleted ones included.
- Joining during a stream of edits misses and repeats none of them.
- An outdated edit is corrected for its sender and not forwarded.
- An invalid, conflicting or over-limit change gets an error and leaves the
  board unchanged.
- Reconnecting catches up on edits made while away, with no further edit.

## Which edit wins

Two people can change the same shape at the same moment. Every browser and the
server must pick the same winner, or people end up looking at different boards.

We use Excalidraw's own rule. For each shape id, compare the two copies:

1. The copy with the higher `version` wins. Excalidraw adds one to a shape's
   `version` every time it changes.
2. If the versions are equal, the copy with the lower `versionNonce` wins.
   `versionNonce` is a random number that changes with every edit, so this is
   just a fixed tie-breaker.
3. A deleted shape is still a copy (`isDeleted: true`) and follows the same
   rule. A delete can lose to an edit with a higher `version`.
4. If `version` and `versionNonce` are both equal, identical content is a
   harmless duplicate. Different content can only come from a nonce collision
   or a buggy client. The server rejects it with `conflict`, while each browser
   keeps whichever copy it saw first.

Because every copy of the board applies the same rule, all copies end up the
same no matter what order messages arrive in, except in the rule 4 conflict
case and for changes the server rejects.

### What this means for users

The winner is the copy that was **edited more**, not the one edited **last**.
If Alice drags a box for a few seconds (many version bumps) while Bob changes
its color once, Alice's copy wins and Bob's color change is lost, even if Bob
clicked last. This is how excalidraw.com behaves, and it is rare in practice
because people seldom edit the same shape at the same time.

### Why not "the change that reaches the server last wins"?

The server passes each winning change to everyone else and never sends your own
winning change back to you. Each browser has already shown its own edit, so
"last" would mean "last to arrive at this browser", which is different for each
person. In the example above, Alice would end up seeing Bob's color and Bob would
see Alice's, and their boards would never match again.

Making "last to reach the server" work would need the server to send every
change back to everyone in one fixed order, and each browser to undo its own
edit when the server's order puts someone else's after it. We may do that later
if the rule above surprises users.

### Where the rule lives

- Browsers: `mergeElements` in `frontend/src/realtime/sceneSync.ts` (#28).
- Server: `beats` and `scene.apply` in `server/internal/realtime/scene.go`
  (#47). The server's tests repeat the browser's `mergeElements` cases, so both
  pick the same winner.
