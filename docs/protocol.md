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

The server sends `{"type":"welcome","clientId":"c_..."}` first. It then
forwards accepted messages to everyone else in that room, adding a trusted
`from` field and never echoing to the sender. On disconnect it sends
`{"type":"leave","clientId":"c_..."}` to the remaining clients and deletes an
empty room. Reconnecting creates a new client ID; no board contents are stored.

Browser messages are UTF-8 JSON objects sent as WebSocket text messages:

```json
{"type":"change","elements":[]}
{"type":"cursor","x":120.5,"y":88,"name":"Kathy","color":"#e03131"}
```

Minimum validation checks the JSON object and its exact `type`, which must be
`change` or `cursor`. Payload fields (including individual Excalidraw elements)
are not validated yet; unknown fields are preserved. Every relayed message has
`"from":"c_..."` set from the connection, replacing any browser-supplied value.
This is a connection identity, not authentication or board access control.

Incoming messages may contain at most 1 MiB (1,048,576 bytes), including JSON
whitespace and before adding `from`. Binary messages, malformed JSON, unsupported
types, and oversized messages receive an error such as
`{"type":"error","message":"message too large"}` and are not broadcast. The
connection stays open after these application errors. Oversized messages are
read with bounded buffering and their remaining bytes discarded before reading
the next message. WebSocket protocol errors and network failures can still close
the connection.

Each client has a reader and a writer, connected to its room by a bounded
outgoing queue of 64 messages. A full queue cancels that connection rather than
blocking other participants or silently discarding edits. Writes have a
10-second timeout. Cancellation stops both loops without closing the outgoing
channel, avoiding sends to a closed channel during concurrent broadcasts.
Server shutdown also cancels active connections. Recovery after disconnection
is separate work; this scaffold cannot resynchronize a slow client's board.

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
