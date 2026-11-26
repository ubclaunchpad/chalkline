# Live editing protocol

This page describes how browsers and the Go server exchange board changes. If
the format or the rule below needs to change, change this page in a PR and tag the
owners of #26, #27, #28 and #29.

## Connections and messages

Each tab connects once at `/ws?board=<boardId>`, adding `&key=<key>` when it
has a share key, or `&claim=<key>` when it has none (see [Share links and view-only access](#share-links-and-view-only-access)). One connection belongs to one
room; clients with the same board ID share the same in-memory room. Before
upgrading, the server requires a valid UTF-8 board ID with 1–64 Unicode code
points; otherwise it returns HTTP 400. IDs are used exactly as supplied, without
trimming or normalization. Default WebSocket origin checks remain enabled.

The server sends `{"type":"welcome","clientId":"c_..."}` first, then exactly
one `snapshot` of the room's board (see [Joining a board](#joining-a-board)),
then the room's `participants` roster (see [Who is in the room](#who-is-in-the-room)).
Each room keeps its own copy of the board in memory and judges every change
against it (see [Sending changes](#sending-changes)). Accepted messages go to
everyone else in the room with a trusted `from` field. The only message sent
back to the sender about its own change is a correction or an error. On
disconnect the server sends `{"type":"leave","clientId":"c_..."}` to the
remaining clients. It flushes pending edits before evicting an empty room;
durable board data remains in PostgreSQL.
Reconnecting creates a new client ID and receives a fresh snapshot.

### Who is in the room

After every join and departure, the server sends the room's complete roster to
every client still in it:

```json
{ "type": "participants", "clientIds": ["c_alice", "c_bob"] }
```

The roster includes the recipient. Treat `clientIds` as a set: the order has no
meaning, and each connected client appears exactly once. Each entry is one
connection (one tab), not one person; a user with two tabs open appears twice.
Clients should replace their whole membership list with each roster rather
than adding or removing entries themselves. The browser parser ignores a roster
that is empty or repeats an ID, keeping the previous list until a valid one
arrives.

A newcomer receives `welcome`, then its `snapshot`, then the roster that
includes it, all queued under the room lock in that order. Clients already in
the room receive only the new roster, never another snapshot. When
someone disconnects, the remaining clients receive one `leave` for that client
and a roster without it. A
reconnect gets a new client ID, a fresh snapshot and a fresh roster; the old ID does not appear
again. No roster is sent when the last client leaves, because the room is
deleted. A cursor that stops updating does not mean its client left; only
`leave` and `participants` change membership.

The server builds each roster from its own room membership under the room lock,
in the same step as the join or departure. Only the newest roster matters, so
each client has at most one roster waiting in its outgoing queue: a newer
roster replaces the waiting one instead of being queued behind it. Without
this, a burst of departures queued a `leave` and a roster per departure and
could overflow healthy clients' 64-message queues, disconnecting them.

This means a roster can arrive earlier than the change that produced it. If
Alice and Bob leave quickly, Carol may receive `leave` Alice, then a roster
already without Alice and Bob, then `leave` Bob. A client can likewise receive
a message from a client after a roster that no longer lists it, but never
after its `leave`. What still holds:

- `welcome` is first, and the newcomer's own roster includes it.
- Every remaining client receives exactly one `leave` per departure.
- The last roster each client receives matches the room.

`leave` messages are still one per departure, so roughly 60 departures before
a client's writer catches up can still overflow its queue. Removing `leave`
in favour of roster diffs would fix that and is a separate protocol change. Rosters are temporary room state; they are not
stored in PostgreSQL or in the board document.

Sending the full roster costs more than separate join and remove events: each
change sends N IDs to N clients. In return, a client never has to rebuild
membership from a history of events, and any single roster is enough to
correct it.

Browser messages are UTF-8 JSON objects sent as WebSocket text messages:

```json
{"type":"change","elements":[],"batchId":"optional"}
{"type":"cursor","x":120.5,"y":88,"name":"Kathy","color":"#f5a9cb","selectedElementIds":["box1"]}
```

`selectedElementIds` is optional: the IDs of the elements the sender has
selected, so other browsers can outline them in the sender's colour. The
server forwards it like any other cursor field without checking it. Browsers
leave it out when nothing is selected, ignore it unless it is an array of
strings, and use at most 500 IDs. A selection change with no pointer movement
is sent as a cursor at the last position.

The envelope must be a JSON object whose exact `type` is `change` or `cursor`.
Browsers cannot send `welcome`, `snapshot`, `leave`, or `participants`; those
get an `invalid_message` error and never change room membership. Unknown
top-level fields are preserved. Every forwarded message has
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
| `persistence_unavailable` | saving failed, pending buffer is full, or shutdown has begun | `Saving is unavailable; new changes are temporarily rejected` |
| `board_full` | the change would grow the board past its limit | `board is full` |
| `forbidden` | a connection opened with a view key sent a `change` | `view-only link: changes are not allowed` |
| `key_required` | the board has keys and the connection's key is missing or wrong; sent once, then the server closes the connection with status 1008 | `this board needs a share link` |

`elementId` is set for `conflict`, and for `invalid_element` when the element's
`id` is a string, cut to its first 64 code points. `batchId` echoes the change's
`batchId`, unless the server could not read it (`message_too_large`, malformed
JSON, or an invalid `batchId`).
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

## Share links and view-only access

Every board has two share keys: an **edit key** and a **view key**. The server
checks them; the browser only reports what the server decided.

- **Creating keys.** The first connection to a board that has no keys becomes
  its creator. The server makes both keys and returns them in that
  connection's `welcome`. This happens once per board, even if two people open
  a new board at the same moment.
- **Claiming a new board.** A browser with no key for a board makes a random
  edit key, saves it, and connects with `&claim=<key>`. If the board has no
  keys, the server uses a claim of 20 to 128 bytes as the edit key (and makes
  the view key). On a board that already has keys a claim grants nothing.
  Without this, a connection that drops before its `welcome` arrives (React
  Strict Mode opens and closes one in development) would make its browser the
  creator and lose the key, and the browser's next attempt would be refused.
- **Edit key.** Everything works as described on this page. `welcome` carries
  `access: "edit"` and both keys, so any editor can share either link.
- **View key.** The connection receives the welcome, snapshot, roster, every
  change and every cursor. Every `change` it sends gets a `forbidden` error and
  is neither applied nor forwarded. Its cursors (and selection) still go to
  everyone. `welcome` carries `access: "view"` and no keys.
- **Missing or wrong key** on a board that has keys: the connection is
  upgraded only to send one `key_required` error, then closed with status 1008
  (policy violation). The browser stops retrying and shows "Needs a share
  link". A plain HTTP 403 would look like a network failure to the browser.

```json
{"type":"welcome","clientId":"c_A","access":"edit","keys":{"edit":"K3...","view":"Q7..."}}
{"type":"welcome","clientId":"c_B","access":"view"}
{"type":"error","code":"forbidden","message":"view-only link: changes are not allowed","batchId":"b1"}
```

A share link is the board URL with the key: `/?board=<boardId>&key=<key>`. The
browser sends a key from the address bar first; otherwise it uses an edit key
it saved in local storage, so the creator keeps edit access when coming back
from the home page. View keys are never saved, so opening your own view link
does not take away your edit access.

Keys are passwords: the server compares them in constant time and never logs
them. They travel in the socket URL, so production must use `wss:`.

Keys sit behind the `realtime.AccessStore` interface. The prototype uses
`MemoryAccess`, which keeps them in memory. **Known limit:** a server restart
forgets every key, and the next person to open a board becomes its creator,
even if they hold an old view link. Storing keys in PostgreSQL next to the
board fixes this and needs a migration. A hub built without an access store
(`NewHub()` in tests) checks no keys: `welcome` has no `access` field, and
browsers treat that as edit access.

Comment threads are board elements, so viewers can read comments but not add
them.

## Joining a board

```json
{"type":"welcome","clientId":"c_...","access":"edit","keys":{"edit":"...","view":"..."}}
{"type":"snapshot","elements":[ ... ]}
{"type":"participants","clientIds":["c_..."]}
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
   Then send back locally authored revisions that beat the snapshot. The server
   restores durable data from PostgreSQL; unsent or uncommitted local revisions
   still need reconciliation through #51.
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

- **Snapshot handling is partial (#51):** the browser merges `snapshot` into
  the board like any change, so late joiners see the board. It does not yet
  stay read-only until the snapshot arrives or re-send local revisions that
  beat it.
- **A rejected change is lost for everyone else:** one bad element rejects its
  whole batch, and today's browser ignores `error` and never re-sends.
- **A full board stays full:** deletes free almost nothing, so a board at the
  new-element limit takes no new shapes while the room lives.
- **Uncommitted edits can be lost in a crash:** the join snapshot restores the
  last durable state. Broadcasting an edit is not a durable-save acknowledgment.

The tests cover these observable scenarios:

```gherkin
Scenario: Participants exchange messages within a board
  Given Alice, Bob, and Carol are on board a and Dan is on board b
  When Alice and Bob send messages
  Then the other participants on board a receive those messages
  And no sender receives its own message
  And Dan receives no messages from board a

Scenario: A participant joins
  Given Alice is on board a and has not moved her cursor
  When Bob joins board a
  Then Bob receives welcome, then the board's snapshot, then a roster containing Alice and Bob
  And Alice receives a roster containing Alice and Bob and no snapshot

Scenario: Membership changes stay within their board
  Given Alice is on board a and Dan and Erin are on board b
  When Bob joins and then leaves board a
  Then Alice receives Bob's roster, leave, and updated roster
  And Dan and Erin receive none of board a's lifecycle messages

Scenario: Concurrent joins and departures settle
  Given Alice is on board a
  When twelve clients join at once and half of them leave immediately
  Then every remaining client's last roster matches the server's room
  And each connected client appears in it exactly once

Scenario: A slow client is removed from the roster
  Given a slow client's outgoing queue is full
  When a broadcast cancels it and its connection is cleaned up
  Then the remaining clients receive a leave for it and a roster without it

Scenario: Many participants leave at once
  Given 50 participants are on board a
  When 40 of them leave before the others' writers catch up
  Then none of the remaining 10 is disconnected
  And each receives one leave per departure and a final roster of the 10

Scenario: A browser cannot send lifecycle messages
  Given Alice and Bob are on the same board
  When Alice sends participants, welcome, snapshot, or leave
  Then Alice receives an error
  And Bob receives no roster or leave, and the room's membership is unchanged

Scenario: A participant disconnects
  Given Alice and Bob are on the same board
  When Alice disconnects
  Then Bob receives one leave message identifying Alice
  And Bob then receives a roster containing only Bob
  And Bob can keep exchanging messages with another participant
  When all participants disconnect
  Then the room is removed
  And a new connection receives a new client ID, a snapshot, and a roster including it

Scenario: A view link cannot change the board
  Given Carol created board a and has its edit and view keys
  And Vic joined with the view key and Eve joined with the edit key
  When Vic sends a change
  Then Vic receives a forbidden error and nobody receives the change
  But Carol and Eve receive Vic's cursor, with his selection
  When Eve sends a change
  Then Carol and Vic receive it

Scenario: A board with keys refuses a missing or wrong key
  Given board a has keys
  When someone connects with no key or a wrong key
  Then they receive a key_required error and the connection closes

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

## Persistence failures

Before upgrade, loading errors return HTTP 503 rather than an empty snapshot.
Only a genuinely unknown board starts empty. Saving is buffered: changes are
normally logged every 250 ms and dirty boards checkpointed every 30 seconds.
On a log failure, the server retains pending data, sends `persistence_unavailable`
to connected clients, and rejects further changes until the queue is committed.
Rejected submissions echo their `batchId` when available. Cursors remain transient
and continue to flow. No saved acknowledgment or new frontend UI is introduced;
#51 must handle rejected local work. See the architecture storage contract for
retry, backpressure, checkpoint, and shutdown details.
