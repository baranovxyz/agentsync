# Commands

Custom commands allow you to create reusable workflows that can be triggered with a simple `/` prefix in the chat input box. These commands help standardize processes across your team and make common tasks more efficient.

![Commands input example](https://cursor.com/docs-static/_next/image?url=%2Fdocs-static%2Fimages%2Fchat%2Fcommands%2Finput.png&w=1920&q=75)

Commands are currently in beta. The feature and syntax may change as we continue to improve it.

## [How commands work](https://cursor.com/docs/agent/chat/commands#how-commands-work)

Commands are defined as plain Markdown files that can be stored in three locations:

1. **Project commands**: Stored in the `.cursor/commands` directory of your project
2. **Global commands**: Stored in the `~/.cursor/commands` directory in your home directory
3. **Team commands**: Created by team admins in the [Cursor Dashboard](https://cursor.com/dashboard?tab=team-content&section=commands) and automatically available to all team members

When you type `/` in the chat input box, Cursor will automatically detect and display available commands from all locations, making them instantly accessible across your workflow.

## [Creating commands](https://cursor.com/docs/agent/chat/commands#creating-commands)

1. Create a `.cursor/commands` directory in your project root
2. Add `.md` files with descriptive names (e.g., `review-code.md`, `write-tests.md`)
3. Write plain Markdown content describing what the command should do
4. Commands will automatically appear in the chat when you type `/`

Here's an example of how your commands directory structure might look:

```
.cursor/└── commands/    ├── address-github-pr-comments.md    ├── code-review-checklist.md    ├── create-pr.md    ├── light-review-existing-diffs.md    ├── onboard-new-developer.md    ├── run-all-tests-and-fix.md    ├── security-audit.md    └── setup-new-feature.md
```

## [Team commands](https://cursor.com/docs/agent/chat/commands#team-commands)

Team commands are available on Team and Enterprise plans.

Team admins can create server-enforced custom commands that are automatically available to all team members. This makes it easy to share standardized prompts and workflows across your entire organization.

### [Creating team commands](https://cursor.com/docs/agent/chat/commands#creating-team-commands)

1. Navigate to the [Team Content dashboard](https://cursor.com/dashboard?tab=team-content&section=commands)
2. Click to create a new command
3. Provide:
   - **Name**: The command name that will appear after the `/` prefix
   - **Description** (optional): Helpful context about what the command does
   - **Content**: The Markdown content that defines the command's behavior
4. Save the command

Once created, team commands are immediately available to all team members when they type `/` in the chat input box. Team members don't need to manually sync or download anything - the commands are automatically synchronized.

### [Benefits of team commands](https://cursor.com/docs/agent/chat/commands#benefits-of-team-commands)

- **Centralized management**: Update commands once and changes are instantly available to all team members
- **Standardization**: Ensure everyone uses consistent workflows and best practices
- **Easy sharing**: No need to distribute files or coordinate updates across the team
- **Access control**: Only team admins can create and modify team commands

## [Parameters](https://cursor.com/docs/agent/chat/commands#parameters)

You can provide additional context to a command in the Agent chat input. Anything you type after the command name is included in the model prompt alongside your provided input. For example:

```
/commit and /pr these changes to address DX-523
```
