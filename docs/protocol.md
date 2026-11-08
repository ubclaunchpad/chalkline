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

A newcomer receives `welcome` first, then the roster that includes it. When
someone disconnects, the remaining clients receive one `leave` for that client
and then the roster without it, so existing cursor cleanup keeps working. A
reconnect gets a new client ID and a fresh roster; the old ID does not appear
again. No roster is sent when the last client leaves, because the room is
deleted. A cursor that stops updating does not mean its client left; only
`leave` and `participants` change membership.

The server builds each roster from its own room membership and queues it under
the room lock, in the same step as the join or departure. Every client
therefore receives membership changes in the same order, and the last roster
it receives matches the room. Rosters are temporary room state; they are not
stored in PostgreSQL or in the board document.

Sending the full roster costs more than separate join and remove events: each
change sends N IDs to N clients. In return, a client never has to rebuild
membership from a history of events, and any single roster is enough to
correct it.

Browser messages are UTF-8 JSON objects sent as WebSocket text messages:

```json
{"type":"change","elements":[]}
{"type":"cursor","x":120.5,"y":88,"name":"Kathy","color":"#e03131"}
```

Minimum validation checks the JSON object and its exact `type`, which must be
`change` or `cursor`. Browsers cannot send `welcome`, `leave`, or
`participants`; those receive the unsupported-type error below and never
change room membership. Payload fields (including individual Excalidraw elements)
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

Scenario: A participant joins
  Given Alice is on board a and has not moved her cursor
  When Bob joins board a
  Then Bob receives welcome first, then a roster containing Alice and Bob
  And Alice receives a roster containing Alice and Bob

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

Scenario: A browser cannot send lifecycle messages
  Given Alice and Bob are on the same board
  When Alice sends participants, welcome, or leave
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
  And a new connection receives a new client ID and a roster including it

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
