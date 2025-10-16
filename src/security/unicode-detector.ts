/**
 * Unicode Attack Detector - Detects malicious hidden instructions using invisible Unicode characters
 * Prevents homoglyph attacks and Trojan Source attacks (CVE-2021-42574)
 */

export interface DangerousUnicodePattern {
  name: string;
  characters: number[]; // Unicode code points
  description: string;
  risk: 'high' | 'medium' | 'low';
  purpose: string;
  cve?: string;
}

export interface UnicodeFinding {
  type: string;
  risk: 'high' | 'medium' | 'low';
  description: string;
  purpose: string;
  cve?: string;
  filePath: string;
  lineNumber: number;
  columnNumber: number;
  lineContent: string;
  character: string;
  codePoint: string;
  position: number;
  context: string;
  contextStart: number;
  contextEnd: number;
  htmlEntity: string;
  unicodeName: string;
}

export interface SanitizeOptions {
  riskThreshold?: 'high' | 'medium' | 'low';
}

export const DANGEROUS_UNICODE_PATTERNS: DangerousUnicodePattern[] = [
  // === ZERO-WIDTH CHARACTERS (HIGH RISK) ===
  {
    name: 'Zero-Width Space',
    characters: [0x200b],
    description: 'Invisible space character',
    risk: 'high',
    purpose: 'Hide instructions between visible text',
  },
  {
    name: 'Zero-Width Non-Joiner',
    characters: [0x200c],
    description: 'Invisible formatting character',
    risk: 'high',
    purpose: 'Break up visible text with hidden content',
  },
  {
    name: 'Zero-Width Joiner',
    characters: [0x200d],
    description: 'Invisible formatting character',
    risk: 'high',
    purpose: 'Insert hidden instructions',
  },
  {
    name: 'Word Joiner',
    characters: [0x2060],
    description: 'Invisible non-breaking space',
    risk: 'high',
    purpose: 'Hide malicious instructions',
  },
  {
    name: 'Zero-Width No-Break Space',
    characters: [0xfeff],
    description: 'Invisible character (BOM)',
    risk: 'high',
    purpose: 'Hide content, confuse parsers',
  },

  // === BIDIRECTIONAL TEXT OVERRIDE (HIGH RISK - CVE-2021-42574) ===
  {
    name: 'Right-to-Left Override',
    characters: [0x202e],
    description: 'Forces text to display right-to-left',
    risk: 'high',
    purpose: 'Make code appear different than it executes (Trojan Source)',
    cve: 'CVE-2021-42574',
  },
  {
    name: 'Left-to-Right Override',
    characters: [0x202d],
    description: 'Forces text to display left-to-right',
    risk: 'medium',
    purpose: 'Combine with RTL for directional confusion',
    cve: 'CVE-2021-42574',
  },
  {
    name: 'Right-to-Left Embedding',
    characters: [0x202b],
    description: 'Embeds right-to-left text',
    risk: 'medium',
    purpose: 'Part of Trojan Source attacks',
    cve: 'CVE-2021-42574',
  },
  {
    name: 'Left-to-Right Embedding',
    characters: [0x202a],
    description: 'Embeds left-to-right text',
    risk: 'low',
    purpose: 'Can be combined with overrides',
    cve: 'CVE-2021-42574',
  },
  {
    name: 'Pop Directional Formatting',
    characters: [0x202c],
    description: 'Ends bidirectional override',
    risk: 'medium',
    purpose: 'Part of Trojan Source attacks',
    cve: 'CVE-2021-42574',
  },

  // === HOMOGLYPH ATTACK CHARACTERS (MEDIUM RISK) ===
  {
    name: 'Cyrillic Lookalike: а (a)',
    characters: [0x0430],
    description: 'Cyrillic character that looks like Latin "a"',
    risk: 'medium',
    purpose: 'Trick users into thinking command is different',
  },
  {
    name: 'Cyrillic Lookalike: е (e)',
    characters: [0x0435],
    description: 'Cyrillic character that looks like Latin "e"',
    risk: 'medium',
    purpose: 'Command spoofing',
  },
  {
    name: 'Cyrillic Lookalike: о (o)',
    characters: [0x043e],
    description: 'Cyrillic character that looks like Latin "o"',
    risk: 'medium',
    purpose: 'Command spoofing',
  },
  {
    name: 'Cyrillic Lookalike: р (p)',
    characters: [0x0440],
    description: 'Cyrillic character that looks like Latin "p"',
    risk: 'medium',
    purpose: 'Command spoofing',
  },
  {
    name: 'Cyrillic Lookalike: с (c)',
    characters: [0x0441],
    description: 'Cyrillic character that looks like Latin "c"',
    risk: 'medium',
    purpose: 'Command spoofing',
  },
  {
    name: 'Cyrillic Lookalike: х (x)',
    characters: [0x0445],
    description: 'Cyrillic character that looks like Latin "x"',
    risk: 'medium',
    purpose: 'Command spoofing',
  },

  // === FORMAT CHARACTERS (LOW-MEDIUM RISK) ===
  {
    name: 'Soft Hyphen',
    characters: [0x00ad],
    description: 'Invisible hyphen',
    risk: 'low',
    purpose: 'Can hide content in line breaks',
  },
  {
    name: 'Mongolian Vowel Separator',
    characters: [0x180e],
    description: 'Looks like whitespace, not actually space',
    risk: 'medium',
    purpose: 'Bypass whitespace detection',
  },

  // === UNUSUAL WHITESPACE (LOW RISK, but suspicious in bulk) ===
  {
    name: 'Non-Breaking Space',
    characters: [0x00a0],
    description: 'Space that prevents line breaks',
    risk: 'low',
    purpose: 'Suspicious if used excessively (>10 in a row)',
  },
  {
    name: 'Em Space',
    characters: [0x2003],
    description: 'Wide space (1em)',
    risk: 'low',
    purpose: 'Can hide spacing differences',
  },
  {
    name: 'Thin Space',
    characters: [0x2009],
    description: 'Narrow space',
    risk: 'low',
    purpose: 'Can hide spacing differences',
  },
];

export class UnicodeAttackDetector {
  private dangerousPatterns: DangerousUnicodePattern[];
  private codePointToPattern: Map<number, DangerousUnicodePattern>;
  private dangerousCodePoints: Set<number>;

  constructor() {
    this.dangerousPatterns = DANGEROUS_UNICODE_PATTERNS;

    // Build lookup structures for performance
    this.dangerousCodePoints = new Set();
    this.codePointToPattern = new Map();

    for (const pattern of this.dangerousPatterns) {
      for (const codePoint of pattern.characters) {
        this.dangerousCodePoints.add(codePoint);
        this.codePointToPattern.set(codePoint, pattern);
      }
    }
  }

  /**
   * Detect dangerous Unicode in content
   */
  async detect(content: string, filePath: string): Promise<UnicodeFinding[]> {
    const findings: UnicodeFinding[] = [];
    const lines = content.split('\n');

    // Scan each character
    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const codePoint = char.codePointAt(0);

      if (!codePoint) continue;

      if (this.dangerousCodePoints.has(codePoint)) {
        const pattern = this.codePointToPattern.get(codePoint)!;
        const lineNumber = this.getLineNumber(content, i);
        const columnNumber = this.getColumnNumber(content, i);
        const lineContent = lines[lineNumber - 1] || '';

        // Get context (50 chars before and after)
        const contextStart = Math.max(0, i - 50);
        const contextEnd = Math.min(content.length, i + 50);
        const context = content.substring(contextStart, contextEnd);

        findings.push({
          type: pattern.name,
          risk: pattern.risk,
          description: pattern.description,
          purpose: pattern.purpose,
          cve: pattern.cve,
          filePath,
          lineNumber,
          columnNumber,
          lineContent: lineContent.trim(),
          character: char,
          codePoint: `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`,
          position: i,
          context: this.sanitizeForDisplay(context),
          contextStart,
          contextEnd,
          htmlEntity: `&#${codePoint};`,
          unicodeName: this.getUnicodeName(codePoint),
        });
      }
    }

    // Also check for suspicious patterns
    const sequenceFindings = this.detectSuspiciousSequences(content, filePath);
    findings.push(...sequenceFindings);

    // Check for Trojan Source patterns
    const trojanFindings = this.detectTrojanSource(content, filePath);
    findings.push(...trojanFindings);

    return findings;
  }

  /**
   * Detect suspicious sequences (e.g., 10+ zero-width chars in a row)
   */
  private detectSuspiciousSequences(
    content: string,
    filePath: string
  ): UnicodeFinding[] {
    const findings: UnicodeFinding[] = [];
    const zeroWidthChars = [0x200b, 0x200c, 0x200d, 0x2060, 0xfeff];

    let sequenceStart = -1;
    let sequenceLength = 0;
    let sequenceChars: number[] = [];

    for (let i = 0; i < content.length; i++) {
      const codePoint = content.codePointAt(i);

      if (codePoint && zeroWidthChars.includes(codePoint)) {
        if (sequenceStart === -1) {
          sequenceStart = i;
        }
        sequenceLength++;
        sequenceChars.push(codePoint);
      } else {
        // Sequence ended - check if suspicious
        if (sequenceLength >= 10) {
          // VERY SUSPICIOUS - likely attack
          const lineNumber = this.getLineNumber(content, sequenceStart);
          findings.push({
            type: 'Suspicious Zero-Width Sequence',
            risk: 'high',
            description: `${sequenceLength} consecutive zero-width characters`,
            purpose: 'Likely hidden malicious instructions',
            filePath,
            lineNumber,
            columnNumber: this.getColumnNumber(content, sequenceStart),
            lineContent:
              content.split('\n')[lineNumber - 1]?.trim() || '',
            character: '',
            codePoint: `Multiple (${sequenceChars
              .map((cp) => 'U+' + cp.toString(16).toUpperCase())
              .join(', ')})`,
            position: sequenceStart,
            context: `[${sequenceLength} zero-width characters]`,
            contextStart: sequenceStart,
            contextEnd: sequenceStart + sequenceLength,
            htmlEntity: '',
            unicodeName: 'Zero-Width Sequence',
          });
        }
        sequenceStart = -1;
        sequenceLength = 0;
        sequenceChars = [];
      }
    }

    return findings;
  }

  /**
   * Check for bidirectional text attacks (CVE-2021-42574)
   */
  private detectTrojanSource(
    content: string,
    filePath: string
  ): UnicodeFinding[] {
    const findings: UnicodeFinding[] = [];
    const bidiChars = [0x202a, 0x202b, 0x202c, 0x202d, 0x202e];

    // Count bidi characters
    let bidiCount = 0;
    let bidiPositions: number[] = [];
    for (let i = 0; i < content.length; i++) {
      const codePoint = content.codePointAt(i);
      if (codePoint && bidiChars.includes(codePoint)) {
        bidiCount++;
        bidiPositions.push(i);
      }
    }

    // More than 2 bidi chars is suspicious in AGENTS.md
    if (bidiCount >= 2) {
      findings.push({
        type: 'Trojan Source Attack Pattern',
        risk: 'high',
        description: `Found ${bidiCount} bidirectional text control characters`,
        purpose: 'Potential Trojan Source attack (CVE-2021-42574)',
        cve: 'CVE-2021-42574',
        filePath,
        lineNumber: 1,
        columnNumber: 1,
        lineContent: 'Multiple bidi controls detected',
        character: '',
        codePoint: 'Multiple',
        position: 0,
        context: `${bidiCount} bidirectional control characters found at positions: ${bidiPositions.join(
          ', '
        )}`,
        contextStart: 0,
        contextEnd: content.length,
        htmlEntity: '',
        unicodeName: 'Bidirectional Controls',
      });
    }

    return findings;
  }

  /**
   * Sanitize invisible characters for display
   */
  private sanitizeForDisplay(text: string): string {
    return Array.from(text)
      .map((char) => {
        const codePoint = char.codePointAt(0);
        if (codePoint && this.dangerousCodePoints.has(codePoint)) {
          return `[U+${codePoint.toString(16).toUpperCase()}]`;
        }
        return char;
      })
      .join('');
  }

  /**
   * Remove dangerous Unicode from content (sanitization)
   */
  async sanitize(content: string, options?: SanitizeOptions): Promise<string> {
    const riskThreshold = options?.riskThreshold || 'high';

    const removeCodePoints = new Set<number>();

    for (const pattern of this.dangerousPatterns) {
      // Remove based on risk level
      if (riskThreshold === 'high' && pattern.risk === 'high') {
        pattern.characters.forEach((cp) => removeCodePoints.add(cp));
      } else if (
        riskThreshold === 'medium' &&
        (pattern.risk === 'high' || pattern.risk === 'medium')
      ) {
        pattern.characters.forEach((cp) => removeCodePoints.add(cp));
      } else if (riskThreshold === 'low') {
        pattern.characters.forEach((cp) => removeCodePoints.add(cp));
      }
    }

    return Array.from(content)
      .filter((char) => {
        const codePoint = char.codePointAt(0);
        return !codePoint || !removeCodePoints.has(codePoint);
      })
      .join('');
  }

  /**
   * Quick check if content has any dangerous Unicode
   */
  async hasDangerousUnicode(content: string): Promise<boolean> {
    for (let i = 0; i < content.length; i++) {
      const codePoint = content.codePointAt(i);
      if (codePoint && this.dangerousCodePoints.has(codePoint)) {
        return true;
      }
    }
    return false;
  }

  private getLineNumber(content: string, position: number): number {
    return content.substring(0, position).split('\n').length;
  }

  private getColumnNumber(content: string, position: number): number {
    const beforePos = content.substring(0, position);
    const lastNewline = beforePos.lastIndexOf('\n');
    return position - lastNewline;
  }

  private getUnicodeName(codePoint: number): string {
    const names: Record<number, string> = {
      0x200b: 'ZERO WIDTH SPACE',
      0x200c: 'ZERO WIDTH NON-JOINER',
      0x200d: 'ZERO WIDTH JOINER',
      0x202a: 'LEFT-TO-RIGHT EMBEDDING',
      0x202b: 'RIGHT-TO-LEFT EMBEDDING',
      0x202c: 'POP DIRECTIONAL FORMATTING',
      0x202d: 'LEFT-TO-RIGHT OVERRIDE',
      0x202e: 'RIGHT-TO-LEFT OVERRIDE',
      0x2060: 'WORD JOINER',
      0xfeff: 'ZERO WIDTH NO-BREAK SPACE',
      0x00ad: 'SOFT HYPHEN',
      0x180e: 'MONGOLIAN VOWEL SEPARATOR',
      0x00a0: 'NO-BREAK SPACE',
      0x2003: 'EM SPACE',
      0x2009: 'THIN SPACE',
      0x0430: 'CYRILLIC SMALL LETTER A',
      0x0435: 'CYRILLIC SMALL LETTER IE',
      0x043e: 'CYRILLIC SMALL LETTER O',
      0x0440: 'CYRILLIC SMALL LETTER ER',
      0x0441: 'CYRILLIC SMALL LETTER ES',
      0x0445: 'CYRILLIC SMALL LETTER HA',
    };
    return names[codePoint] || 'UNKNOWN';
  }
}