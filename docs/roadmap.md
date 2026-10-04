# Roadmap: directions to explore

This is a working space for scoping the project, not a fixed commitment for either term. We want to test a broad range of possibilities, then choose work that makes a useful product and gives designers and developers meaningful ownership. The order and depth of these ideas are open to discussion.

## Possible product directions

- **Collaborative architecture canvas:** Shareable boards, live cursors, typed components, reliable editing, recovery after a disconnect, and export. How much collaboration is needed for the first useful release?
- **Architecture feedback:** Derive a graph from the canvas and identify missing connections, weak points, or likely bottlenecks. What feedback can we support with clear rules before adding AI?
- **System-design practice:** Offer prompts, example constraints, revisions, and comparison of attempts. Would a small set of excellent exercises be more useful than a broad library?
- **AI-assisted review:** Explain tradeoffs, suggest improvements, and give bottleneck analysis grounded in the graph. How will we check that feedback is accurate and useful?
- **Infrastructure export:** Generate AWS CDK or Terraform from a design. Which components can be mapped safely, and which deployment details must the user supply?
- **Agent access:** Let agents inspect or work with boards through an MCP server or another interface. What permissions and operations would make this useful?
- **Sharing and discovery:** Try templates, public examples, Mermaid export, or other ways for people to learn from and share designs. Which ideas might attract and retain real users?
- **Operations and scale:** Explore dashboards, performance work, or room ownership across servers if usage or team learning goals justify them.

## How we will choose

For each direction, we should ask who it serves, what a small useful version looks like, what we need to learn first, and how we would tell whether it worked. We should weigh user value, technical risk, design effort, and the skills team members want to build. Short prototypes and feedback from potential users should shape the scope before we promise a feature or assign it to a term.

An early release may focus on a dependable shared canvas and semantic model. A later release may deepen practice, feedback, exports, or agent access. We will set measurable milestones after the team has explored these options together.
