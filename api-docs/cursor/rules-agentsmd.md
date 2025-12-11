# Rules

Rules provide system-level instructions to Agent and Inline Edit. They are persistent context, preferences, or workflows for your projects.

Cursor supports four types of rules:

Project Rules

Stored in `.cursor/rules`, version-controlled and scoped to your codebase.

User Rules

Global to your Cursor environment. Defined in settings and always applied.

Team Rules

Team-wide rules managed from the dashboard. Available on Team and [Enterprise](https://cursor.com/docs/enterprise) plans.

AGENTS.md

Agent instructions in markdown format. Simple alternative to `.cursor/rules`.

## [How rules work](https://cursor.com/en-US/docs/context/rules#how-rules-work)

Large language models don't retain memory between completions. Rules provide persistent, reusable context at the prompt level.

When applied, rule contents are included at the start of the model context. This gives the AI consistent guidance for generating code, interpreting edits, or helping with workflows.

![Rule applied in context with chat](https://cursor.com/docs-static/_next/image?url=%2Fdocs-static%2Fimages%2Fcontext%2Frules%2Frules-applied.png&w=1920&q=75)

Rules apply to [Chat](https://cursor.com/docs/agent/overview) and [Inline Edit](https://cursor.com/docs/inline-edit/overview). Active rules show in the Agent sidebar.

## [Project rules](https://cursor.com/en-US/docs/context/rules#project-rules)

Project rules live in `.cursor/rules`. Each rule is a file and version-controlled. They are scoped using path patterns, invoked manually, or included based on relevance. Subdirectories include their own `.cursor/rules` directory scoped to that folder.

Use project rules to:

- Encode domain-specific knowledge about your codebase
- Automate project-specific workflows or templates
- Standardize style or architecture decisions

### [Rule anatomy](https://cursor.com/en-US/docs/context/rules#rule-anatomy)

Each rule file is written in **MDC** (`.mdc`), a format supporting metadata and content. Control how rules are applied from the type dropdown which changes properties `description`, `globs`, `alwaysApply`.

| Rule Type                 | Description                                           |
| ------------------------- | ----------------------------------------------------- |
| `Always Apply`            | Apply to every chat and cmd-k session                 |
| `Apply Intelligently`     | When Agent decides it's relevant based on description |
| `Apply to Specific Files` | When file matches a specified pattern                 |
| `Apply Manually`          | When @-mentioned                                      |

```
---description: RPC Service boilerplateglobs:alwaysApply: false---- Use our internal RPC pattern when defining services- Always use snake_case for service names.@service-template.ts
```

### [Nested rules](https://cursor.com/en-US/docs/context/rules#nested-rules)

Organize rules by placing them in `.cursor/rules` directories throughout your project. Nested rules automatically attach when files in their directory are referenced.

```
project/  .cursor/rules/        # Project-wide rules  backend/    server/      .cursor/rules/    # Backend-specific rules  frontend/    .cursor/rules/      # Frontend-specific rules
```

### [Creating a rule](https://cursor.com/en-US/docs/context/rules#creating-a-rule)

Create rules using the `New Cursor Rule` command or going to `Cursor Settings > Rules`. This creates a new rule file in `.cursor/rules`. From settings you can see all rules and their status.

![Comparison of concise vs long rules](https://cursor.com/docs-static/_next/image?url=%2Fdocs-static%2Fimages%2Fcontext%2Frules%2Frule-settings.png&w=1920&q=75)

## [Best practices](https://cursor.com/en-US/docs/context/rules#best-practices)

Good rules are focused, actionable, and scoped.

- Keep rules under 500 lines
- Split large rules into multiple, composable rules
- Provide concrete examples or referenced files
- Avoid vague guidance. Write rules like clear internal docs
- Reuse rules when repeating prompts in chat

## [Examples](https://cursor.com/en-US/docs/context/rules#examples)

###

Standards for frontend components and API validation

###

Templates for Express services and React components

###

Automating development workflows and documentation generation

###

Adding a new setting in Cursor

Examples are available from providers and frameworks. Community-contributed rules are found across crowdsourced collections and repositories online.

## [Team Rules](https://cursor.com/en-US/docs/context/rules#team-rules)

Team and [Enterprise](https://cursor.com/docs/enterprise) plans can create and enforce rules across their entire organization from the [Cursor dashboard](https://cursor.com/dashboard?tab=team-content). Admins can configure whether or not each rule is required for team members.

Team Rules work alongside other rule types and take precedence to ensure organizational standards are maintained across all projects. They provide a powerful way to ensure consistent coding standards, practices, and workflows across your entire team without requiring individual setup or configuration.

### [Managing Team Rules](https://cursor.com/en-US/docs/context/rules#managing-team-rules)

Team administrators can create and manage rules directly from the Cursor dashboard:

![Empty team rules dashboard where team administrators can add new rules](https://cursor.com/docs-static/_next/image?url=%2Fdocs-static%2Fimages%2Fcontext%2Frules%2Fteam-rules-empty.png&w=1920&q=75)

Once team rules are created, they automatically apply to all team members and are visible in the dashboard:

![Team rules dashboard showing a single team rule that will be enforced for all team members](https://cursor.com/docs-static/_next/image?url=%2Fdocs-static%2Fimages%2Fcontext%2Frules%2Fteam-rules-1.png&w=1920&q=75)

### [Activation and enforcement](https://cursor.com/en-US/docs/context/rules#activation-and-enforcement)

- **Enable this rule immediately**: When checked, the rule is active as soon as you create it. When unchecked, the rule is saved as a draft and does not apply until you enable it later.
- **Enforce this rule**: When enabled, the rule is required for all team members and cannot be disabled in their Cursor settings. When not enforced, team members can toggle the rule off in `Cursor Settings → Rules` under the Team Rules section.

By default, non‑enforced Team Rules can be disabled by users. Use **Enforce this rule** to prevent that.

### [Format and how Team Rules are applied](https://cursor.com/en-US/docs/context/rules#format-and-how-team-rules-are-applied)

- **Plain text, no MDC**: Team Rules are free‑form text. They do not use the MDC format and do not support metadata such as `globs`, `alwaysApply`, or rule types.
- **Where they apply**: When a Team Rule is enabled (and not disabled by the user, unless enforced), it is included in the model context for both Agent (Chat) and Inline Edit across all repositories and projects for that team.
- **Precedence**: Rules are applied in this order: **Team Rules → Project Rules → User Rules**. All applicable rules are merged; earlier sources take precedence when guidance conflicts.

Some teams use enforced rules as part of internal compliance workflows. While this is supported, AI guidance should not be your only security control.

## [AGENTS.md](https://cursor.com/en-US/docs/context/rules#agentsmd)

`AGENTS.md` is a simple markdown file for defining agent instructions. Place it in your project root as an alternative to `.cursor/rules` for straightforward use cases.

Unlike Project Rules, `AGENTS.md` is a plain markdown file without metadata or complex configurations. It's perfect for projects that need simple, readable instructions without the overhead of structured rules.

Cursor supports AGENTS.md in the project root and subdirectories.

```
# Project Instructions## Code Style- Use TypeScript for all new files- Prefer functional components in React- Use snake_case for database columns## Architecture- Follow the repository pattern- Keep business logic in service layers
```

### [Improvements](https://cursor.com/en-US/docs/context/rules#improvements)

###

Nested AGENTS.md support

Nested `AGENTS.md` support in subdirectories is now available. You can place `AGENTS.md` files in any subdirectory of your project, and they will be automatically applied when working with files in that directory or its children.

This allows for more granular control of agent instructions based on the area of your codebase you're working in:

```
project/  AGENTS.md              # Global instructions  frontend/    AGENTS.md            # Frontend-specific instructions    components/      AGENTS.md          # Component-specific instructions  backend/    AGENTS.md            # Backend-specific instructions
```

Instructions from nested `AGENTS.md` files are combined with parent directories, with more specific instructions taking precedence.

## [User Rules](https://cursor.com/en-US/docs/context/rules#user-rules)

User rules are global preferences defined in **Cursor Settings → Rules** that apply across all projects. They're plain text and perfect for setting preferred communication style or coding conventions:

```
Please reply in a concise style. Avoid unnecessary repetition or filler language.
```

## [`.cursorrules`](https://cursor.com/en-US/docs/context/rules#cursorrules)

The `.cursorrules` (legacy) file in your project root is still supported but **will be deprecated**. We recommend migrating to Project Rules or to `AGENTS.md`.

##
