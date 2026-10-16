# Welcome to Chalkline

## What we are making and why

Chalkline is a shared canvas for designing software systems. A person could
place a service, database, or queue, connect them, invite a teammate, and return
to the same board later. We want people outside the team to find it useful, and
we want contributors to have work they are proud to show and explain.

General drawing tools make it easy to sketch a system. Our product hypothesis is
that a sketch becomes more useful when its components and connections also have
structured meaning: the app can understand that one shape is a database and an
arrow connects it to a service. That could support validation, guided practice,
or an inspectable infrastructure export. We still need to learn which of those
would help real users. Our first job is to make a dependable shared board and
test it with people outside the club. See the [product goals](product.md) and
[open directions](roadmap.md).

We are organizing into subteams so you can gain depth and ownership in an area
you enjoy. You should be able to explain a decision you made and a piece you
built, while knowing enough about neighboring areas to collaborate well. Pairing
on an integration point is a way to try another part of the stack without
carrying two full workloads. Designers should have room to research and propose
interactions throughout development (or reject Alan and Owen's ideas lol).

## The whole system in five minutes

1. **Canvas and interaction:** A React app embeds Excalidraw. Excalidraw
   supplies the drawing surface, shapes, arrows, editing tools, and scene data.
   Our app adds typed architecture components (shapes that represent system
   design components like a load balancer), configuration, sharing flows, and
   reconciliation between local and remote edits. The embedded package does not
   provide our board collaboration service for us.
   [Excalidraw developer docs](https://docs.excalidraw.com/docs) and
   [package FAQ](https://docs.excalidraw.com/docs/%40excalidraw/excalidraw/faq)
   are starting points.
2. **Collaboration and infrastructure:** A browser opens a WebSocket connection
   to a Go server. Unlike a one-off HTTP request, the connection stays open so
   either side can send an update. The server checks permission, validates and
   orders edits, and sends accepted changes to other people on the board. It
   also tracks temporary presence. PostgreSQL (could pivot to a managed DB)
   stores snapshots and an operation log so document changes survive a restart.
   Cloud hosting (for our service) is a WIP but I will figure this out as a lot
   of people are interested in this side!
3. **Semantics and backend:** Typed data on canvas elements says what each
   component represents and other additional info. We derive a graph of nodes
   and connections from those elements and arrow bindings. That graph can drive
   structural checks and, later, other product ideas (like exporting your design
   to AWS CDK configuration so keep some ideas in your head of possible
   applications when reading through this doc!). This area includes deciding
   which system-design concepts belong in the component catalog and what their
   fields and connections mean. This team would likely be the one with the least
   time commitment BTW!
4. **Product design:** Designers explore who the tool serves, how people create
   and understand components, what collaboration feels like, and how feedback or
   errors appear. Their research and interaction ideas shape what the other
   areas build.

Try drawing out all the things that need to happen from one small edit: someone
moves a database component to the right a little bit on their whiteboard; the
canvas (client) reports a change to the Go server; another client collaborating
mirrors the same same; our storage makes it recoverable if a browser
disconnects. [Documentation Link](architecture.md).

## Follow the path that interests you

### Canvas and interaction

[Excalidraw](https://excalidraw.com/) is open-source and has a lot of components
we can build on / use for actually creating our whiteboard and components. We're
gonna be working with it a lot and styling on top of it!

Start with the
[Excalidraw package README](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/README.md)
and [scene format](https://docs.excalidraw.com/docs/codebase/json-schema/).
Notice that we get a mature editor and scene elements, while our app must decide
which shapes mean “service” or “database” and how an edit becomes a shared board
change. Then look at
[element types](https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/types.ts)
if you want to see `customData` and bindings in code (this is around line 80).
Think about where a component palette or property panel would fit, and what a
person sees during reconnect.

**Tiny thing to explain:** What does Excalidraw give us, and what must Chalkline
add for a typed, shared board?

### Collaboration and infrastructure

Read a short
[WebSocket client introduction](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_client_applications).
If Go is new to you, try the first part of
[A Tour of Go](https://go.dev/tour/welcome/1): packages, structs, methods, and
interfaces are enough to begin.

The main reason I chose Go for this is its awesome to work with, good
performance and tooling, and a perfect fit for our cloud and concurrency niche.
A little more about Go:

- Go is a compiled language feels like a mix of Python and C. It's most commonly
  used for backend, networking, and cloud software thanks to its excellent
  built-in concurrency support and fast, native executable compilation.

Coming back to the main challenge of this section, when two people edit at once,
the server needs a stable order. When we create a new server instance or restart
an old one, it must be able to rebuild a board from durable data (our database).
If you want to go further, read about
[WebSockets in 10 mins](https://dev.to/lialiago/the-beginners-guide-to-understanding-websocket-431f)
or take a full hour to go deeper into
[WebSocket servers](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers).
I'm also a TA for computer networking so I'll try to do some deeper reading
myself to be another resource.

**Tiny thing to explain:** Why is a WebSocket useful here, and what does the Go
server decide that clients cannot decide for it?

### Semantics and backend

Start with the difference between a picture and a model: a rectangle labeled
“cache” looks useful, but structured component data (like metadata on the
object) lets our system check what it is connected to. The Excalidraw
[scene format](https://docs.excalidraw.com/docs/codebase/json-schema/) shows the
elements we start from. Our graph is derived from the elements and bindings; it
is not a second board document.

This side of the project is where you can heavily explore system design as one
of the things you'll be doing is figuring out what components we should actually
include! Use the
[System Design Primer](https://github.com/donnemartin/system-design-primer) as a
menu of concepts (its super long so I don't expect you to have to read it). Pick
two or three components you think a first-time user would need, such as a
client, service, load balancer, database, cache, or queue. Try to answer what it
does, when would someone use it, and what properties matter in a diagram. A
small well-defined catalog is gonna be more valuable than a long list of vague
icons. Look at the [product.md](product.md) and suggest additions! **Anyone from
another subteam who wants comparable depth is welcome to do this exercise too**.

**Tiny thing to explain:** Pick one component and explain one property or
connection the app could validate, plus one tradeoff its icon alone would hide.

### Product design

Think about a new user making a system diagram with a teammate: how do they find
a component, understand what it means, change its properties, tell whether an
edit saved, and notice a collaborator's work? Explore one of those moments
through a sketch, conversation, or quick prototype. You have room to challenge
the proposed experience and really determine the entire feel for the app. Read
the [product goals](product.md) and the
[whole-system overview](#the-whole-system-in-five-minutes) so your ideas connect
to the technical possibilities and limits.

Note, as for a whiteboarding app that I think has a really great experience,
Excalidraw feels like a solid option to me. I would suggest playing around with
it a bit to find out the feel we're going for. I think all of you guys have a
lot of skill and we can create something even better than it!

**Tiny thing to explain:** Which moment in that journey would you improve first,
and what would help a user understand what happened?

## How we will build together

Owen and Alan will turn work into GitHub issues with a user or technical goal
and a small, observable “done when” statement. We will discuss scope and assign
issues around subteam interest and realistic weekly time usually at our weekly
meetings. Assignments are not a measure of rank or ability but more so general
interest and are in no way fixed. Work crossing areas should involve the
relevant people early. The [team workflow](workflow.md) explains the planned
branches and reviews.

For a code change, make a focused feature branch from `dev`, open a pull request
to `dev`, and describe the problem, approach, and checks you ran. Someone in the
relevant subteam reviews first; Owen or Alan gives final approval. Designers
review material UI changes. Reviews are for understanding the work together and
catching problems before they reach users. You should be able to explain the
code you submit, including code created with AI help.

I'm super big on a lot of this static checking and tests to catch issues early.
We'll be using things like strict TypeScript to catch mismatched data before the
browser runs it, Go binary compilation, static checks, and race checks to catch
mistakes in the server, mutation/unit/integration tests to check expected
behavior and failure paths, especially live edits, recovery, and access
permissions. Our planned CI will run these checks on proposed changes to be more
align with a professional dev and give everyone some more resume points. The
checks support reliable collaboration and a product we can confidently show
people; they are not a grade on the contributor.

## Your two takeaways

1. **Be able to explain one tiny part of the system in your own words.**
2. **Bring one idea for where Chalkline could go later, perhaps next semester.**
   Who would use it? What would they do? Why might it be more useful than the
   tools they already have? What is one small way we could test that idea?
   Possibilities include guided system-design practice, useful feedback on a
   diagram, or turning a typed design into inspectable cloud configuration. Your
   idea can be completely different. We will compare ideas with real-user
   feedback before choosing a direction.

If something in this guide is unclear or a different area sounds more exciting,
tell Owen or Alan.
