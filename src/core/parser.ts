/**
 * AGENTS.md Parser
 * Parses and validates AGENTS.md files using remark/unified
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import grayMatter from 'gray-matter';
import { ParseError, ValidationError } from './errors.js';
import {
  AgentsMdSchema,
  type AgentsMd,
  type Command,
  type Rule,
  type GitRule,
  type McpServer,
  type FileMapping
} from '../types/schemas.js';
import type { ParsedSection, ParseResult } from '../types/index.js';
import type { Root, RootContent } from 'mdast';

/**
 * Parser for AGENTS.md files
 */
export class AgentsMdParser {
  private processor = unified()
    .use(remarkParse)
    .use(remarkStringify);

  /**
   * Parse AGENTS.md content
   */
  async parse(content: string, filePath: string = 'AGENTS.md'): Promise<ParseResult> {
    try {
      // Extract frontmatter if present
      const { data: frontmatter, content: markdown } = grayMatter(content);

      // Parse markdown to AST
      const ast = this.processor.parse(markdown);

      // Extract sections from AST
      const sections = this.extractSections(ast);

      // Convert sections to structured data
      const agentsMd = this.sectionsToAgentsMd(sections, filePath);

      // Add frontmatter data if present
      if (Object.keys(frontmatter).length > 0) {
        agentsMd.metadata = {
          ...agentsMd.metadata,
          ...frontmatter,
        };
      }

      return {
        agentsMd,
        raw: content,
        sections,
        frontmatter: Object.keys(frontmatter).length > 0 ? frontmatter : undefined,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new ParseError(
          `Failed to parse ${filePath}`,
          filePath,
          undefined,
          undefined,
          error
        );
      }
      throw error;
    }
  }

  /**
   * Extract sections from markdown AST
   */
  private extractSections(ast: Root): ParsedSection[] {
    const sections: ParsedSection[] = [];
    let currentSection: ParsedSection | null = null;
    let currentContent: string[] = [];

    const processNode = (node: RootContent, depth: number = 0) => {
      if (node.type === 'heading') {
        // Save previous section if exists
        if (currentSection) {
          currentSection.content = currentContent.join('\n').trim();
          sections.push(currentSection);
        }

        // Start new section
        const title = this.extractText(node);
        currentSection = {
          title,
          content: '',
          level: node.depth,
          children: [],
        };
        currentContent = [];
      } else if (currentSection) {
        // Accumulate content for current section
        if (node.type === 'paragraph' || node.type === 'list' || node.type === 'code') {
          currentContent.push(this.nodeToMarkdown(node));
        }
      }

      // Process children
      if ('children' in node && node.children) {
        node.children.forEach((child) => processNode(child, depth + 1));
      }
    };

    if (ast.children) {
      ast.children.forEach((node) => processNode(node));
    }

    // Save last section
    if (currentSection !== null) {
      (currentSection as ParsedSection).content = currentContent.join('\n').trim();
      sections.push(currentSection);
    }

    return this.nestSections(sections);
  }

  /**
   * Nest sections based on heading levels
   */
  private nestSections(sections: ParsedSection[]): ParsedSection[] {
    const nested: ParsedSection[] = [];
    const stack: ParsedSection[] = [];

    for (const section of sections) {
      // Find parent based on level
      while (stack.length > 0 && stack[stack.length - 1].level >= section.level) {
        stack.pop();
      }

      if (stack.length === 0) {
        // Top-level section
        nested.push(section);
        stack.push(section);
      } else {
        // Child section
        const parent = stack[stack.length - 1];
        if (!parent.children) {
          parent.children = [];
        }
        parent.children.push(section);
        stack.push(section);
      }
    }

    return nested;
  }

  /**
   * Convert sections to AgentsMd structure
   */
  private sectionsToAgentsMd(sections: ParsedSection[], filePath: string): AgentsMd {
    const agentsMd: Partial<AgentsMd> = {
      metadata: {
        filePath,
        lineCount: 0,
        warnings: [],
      },
    };

    for (const section of sections) {
      const lowerTitle = section.title.toLowerCase();

      if (lowerTitle.includes('overview') || lowerTitle.includes('description')) {
        agentsMd.projectOverview = section.content;
      } else if (lowerTitle.includes('build')) {
        agentsMd.buildCommands = this.parseCommands(section);
      } else if (lowerTitle.includes('test')) {
        agentsMd.testCommands = this.parseCommands(section);
      } else if (lowerTitle.includes('code style') || lowerTitle.includes('style guide')) {
        agentsMd.codeStyle = this.parseRules(section);
      } else if (lowerTitle.includes('structure') || lowerTitle.includes('project layout')) {
        agentsMd.projectStructure = this.parseFileMapping(section);
      } else if (lowerTitle.includes('git') || lowerTitle.includes('workflow')) {
        agentsMd.gitWorkflow = this.parseGitRules(section);
      } else if (lowerTitle.includes('permission')) {
        agentsMd.permissions = this.parsePermissions(section);
      } else if (lowerTitle.includes('mcp') || lowerTitle.includes('server')) {
        agentsMd.mcpServers = this.parseMcpServers(section);
      }
    }

    // Set defaults
    agentsMd.projectOverview = agentsMd.projectOverview || 'No project overview provided';
    agentsMd.buildCommands = agentsMd.buildCommands || [];
    agentsMd.testCommands = agentsMd.testCommands || [];
    agentsMd.codeStyle = agentsMd.codeStyle || [];
    agentsMd.projectStructure = agentsMd.projectStructure || [];
    agentsMd.gitWorkflow = agentsMd.gitWorkflow || [];

    return agentsMd as AgentsMd;
  }

  /**
   * Parse commands from a section
   */
  private parseCommands(section: ParsedSection): Command[] {
    const commands: Command[] = [];
    const lines = section.content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        const content = trimmed.substring(1).trim();

        // Try to extract command from backticks
        const codeMatch = content.match(/`([^`]+)`/);
        if (codeMatch) {
          const command = codeMatch[1];
          const description = content.replace(/`[^`]+`/, '').trim().replace(/^[:\-\s]+/, '');

          commands.push({
            description: description || command,
            command,
            scope: 'project',
          });
        } else if (content.includes(':')) {
          // Format: "Description: command"
          const [desc, cmd] = content.split(':').map(s => s.trim());
          if (cmd) {
            commands.push({
              description: desc,
              command: cmd,
              scope: 'project',
            });
          }
        }
      }
    }

    return commands;
  }

  /**
   * Parse rules from a section
   */
  private parseRules(section: ParsedSection): Rule[] {
    const rules: Rule[] = [];
    const lines = section.content.split('\n');
    let currentRule: Partial<Rule> | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.match(/^\d+\./)) {
        if (currentRule && currentRule.title && currentRule.content) {
          rules.push(currentRule as Rule);
        }

        const content = trimmed.replace(/^[\-\*\d\.]\s*/, '');
        currentRule = {
          id: `rule-${rules.length + 1}`,
          title: content.split('.')[0] || content,
          content: content,
          tags: [],
        };
      } else if (currentRule && trimmed) {
        currentRule.content = `${currentRule.content}\n${trimmed}`;
      }
    }

    if (currentRule && currentRule.title && currentRule.content) {
      rules.push(currentRule as Rule);
    }

    return rules;
  }

  /**
   * Parse git workflow rules
   */
  private parseGitRules(section: ParsedSection): GitRule[] {
    const rules: GitRule[] = [];
    const lines = section.content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        const content = trimmed.substring(1).trim();

        // Determine git rule type
        let type: GitRule['type'] = 'commit';
        if (content.toLowerCase().includes('branch')) type = 'branch';
        else if (content.toLowerCase().includes('pr') || content.toLowerCase().includes('pull request')) type = 'pr';
        else if (content.toLowerCase().includes('merge')) type = 'merge';

        rules.push({
          type,
          rule: content,
          description: content,
        });
      }
    }

    return rules;
  }

  /**
   * Parse file mapping/project structure
   */
  private parseFileMapping(section: ParsedSection): FileMapping[] {
    const mappings: FileMapping[] = [];
    const lines = section.content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        const content = trimmed.substring(1).trim();

        // Try to extract path pattern
        const codeMatch = content.match(/`([^`]+)`/);
        if (codeMatch) {
          const pattern = codeMatch[1];
          const description = content.replace(/`[^`]+`/, '').trim().replace(/^[:\-\s]+/, '');

          mappings.push({
            pattern,
            description: description || pattern,
            purpose: description,
          });
        } else if (content.includes('/')) {
          // Likely a path
          const parts = content.split(/[:\-]/).map(s => s.trim());
          mappings.push({
            pattern: parts[0],
            description: parts[1] || parts[0],
          });
        }
      }
    }

    return mappings;
  }

  /**
   * Parse permissions section
   */
  private parsePermissions(section: ParsedSection): AgentsMd['permissions'] {
    const permissions: AgentsMd['permissions'] = {
      allowedWithoutPrompt: [],
      requireApproval: [],
      blocked: [],
    };

    let currentCategory: keyof NonNullable<AgentsMd['permissions']> | null = null;
    const lines = section.content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();

      if (trimmed.includes('allowed') || trimmed.includes('without prompt')) {
        currentCategory = 'allowedWithoutPrompt';
      } else if (trimmed.includes('require') || trimmed.includes('approval')) {
        currentCategory = 'requireApproval';
      } else if (trimmed.includes('block') || trimmed.includes('forbidden')) {
        currentCategory = 'blocked';
      } else if (currentCategory && (line.startsWith('-') || line.startsWith('*'))) {
        const item = line.substring(1).trim();
        if (item) {
          permissions[currentCategory].push(item);
        }
      }
    }

    return permissions;
  }

  /**
   * Parse MCP servers section
   */
  private parseMcpServers(section: ParsedSection): McpServer[] {
    const servers: McpServer[] = [];
    const lines = section.content.split('\n');
    let currentServer: Partial<McpServer> | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        if (currentServer && currentServer.name && currentServer.command) {
          servers.push(currentServer as McpServer);
        }

        const content = trimmed.substring(1).trim();
        // Try to parse as "name: command"
        if (content.includes(':')) {
          const [name, command] = content.split(':').map(s => s.trim());
          currentServer = { name, command };
        } else {
          currentServer = { name: content, command: content };
        }
      } else if (currentServer && trimmed) {
        // Additional server configuration
        if (trimmed.startsWith('args:')) {
          currentServer.args = trimmed.substring(5).trim().split(/\s+/);
        } else if (trimmed.startsWith('env:')) {
          // Parse environment variables
          currentServer.env = {};
        }
      }
    }

    if (currentServer && currentServer.name && currentServer.command) {
      servers.push(currentServer as McpServer);
    }

    return servers;
  }

  /**
   * Extract text from a node
   */
  private extractText(node: RootContent): string {
    if (node.type === 'text') {
      return node.value;
    }
    if ('children' in node && node.children) {
      return node.children.map((child) => this.extractText(child)).join('');
    }
    return '';
  }

  /**
   * Convert node back to markdown
   */
  private nodeToMarkdown(node: RootContent): string {
    // Wrap single node in a root node for stringify
    const rootNode: Root = {
      type: 'root',
      children: [node]
    };
    return this.processor.stringify(rootNode);
  }

  /**
   * Validate parsed AgentsMd
   */
  validate(agentsMd: AgentsMd): void {
    const result = AgentsMdSchema.safeParse(agentsMd);

    if (!result.success) {
      throw new ValidationError(
        'AGENTS.md validation failed',
        result.error
      );
    }
  }

  /**
   * Parse and validate in one step
   */
  async parseAndValidate(content: string, filePath: string = 'AGENTS.md'): Promise<ParseResult> {
    const parsed = await this.parse(content, filePath);
    this.validate(parsed.agentsMd);
    return parsed;
  }
}

export default AgentsMdParser;