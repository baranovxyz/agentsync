/**
 * Unicode Attack Detector - Detects malicious hidden instructions using invisible Unicode characters
 * Prevents homoglyph attacks and Trojan Source attacks (CVE-2021-42574)
 */

export interface DangerousUnicodePattern {
  name: string;
  characters: number[]; // Unicode code points
  description: string;
  risk: "high" | "medium" | "low";
  purpose: string;
  cve?: string;
}

export interface UnicodeFinding {
  type:
    | "ZERO_WIDTH"
    | "BIDI_CONTROL"
    | "HOMOGLYPH"
    | "SUSPICIOUS_SEQUENCE"
    | "TROJAN_SOURCE"
    | string;
  severity: "high" | "medium" | "low";
  description: string;
  purpose: string;
  cve?: string;
  filePath?: string;
  line: number;
  column: number;
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

export interface DetectionResult {
  hasProblems: boolean;
  findings: UnicodeFinding[];
}

export interface SanitizeOptions {
  riskThreshold?: "high" | "medium" | "low";
}

export const DANGEROUS_UNICODE_PATTERNS: DangerousUnicodePattern[] = [
  // === ZERO-WIDTH CHARACTERS (HIGH RISK) ===
  {
    name: "Zero-Width Space",
    characters: [0x200b],
    description: "Invisible space character",
    risk: "high",
    purpose: "Hide instructions between visible text",
  },
  {
    name: "Zero-Width Non-Joiner",
    characters: [0x200c],
    description: "Invisible formatting character",
    risk: "high",
    purpose: "Break up visible text with hidden content",
  },
  {
    name: "Zero-Width Joiner",
    characters: [0x200d],
    description: "Invisible formatting character",
    risk: "high",
    purpose: "Insert hidden instructions",
  },
  {
    name: "Word Joiner",
    characters: [0x2060],
    description: "Invisible non-breaking space",
    risk: "high",
    purpose: "Hide malicious instructions",
  },
  {
    name: "Zero-Width No-Break Space",
    characters: [0xfeff],
    description: "Invisible character (BOM)",
    risk: "high",
    purpose: "Hide content, confuse parsers",
  },

  // === BIDIRECTIONAL TEXT OVERRIDE (HIGH RISK - CVE-2021-42574) ===
  {
    name: "Right-to-Left Override",
    characters: [0x202e],
    description: "Forces text to display right-to-left",
    risk: "high",
    purpose: "Make code appear different than it executes (Trojan Source)",
    cve: "CVE-2021-42574",
  },
  {
    name: "Left-to-Right Override",
    characters: [0x202d],
    description: "Forces text to display left-to-right",
    risk: "medium",
    purpose: "Combine with RTL for directional confusion",
    cve: "CVE-2021-42574",
  },
  {
    name: "Right-to-Left Embedding",
    characters: [0x202b],
    description: "Embeds right-to-left text",
    risk: "medium",
    purpose: "Part of Trojan Source attacks",
    cve: "CVE-2021-42574",
  },
  {
    name: "Left-to-Right Embedding",
    characters: [0x202a],
    description: "Embeds left-to-right text",
    risk: "low",
    purpose: "Can be combined with overrides",
    cve: "CVE-2021-42574",
  },
  {
    name: "Pop Directional Formatting",
    characters: [0x202c],
    description: "Ends bidirectional override",
    risk: "medium",
    purpose: "Part of Trojan Source attacks",
    cve: "CVE-2021-42574",
  },

  // === HOMOGLYPH ATTACK CHARACTERS (HIGH RISK - Cyrillic/Greek lookalikes) ===
  {
    name: "Cyrillic Lookalike: а (a)",
    characters: [0x0430],
    description: 'Cyrillic character that looks like Latin "a"',
    risk: "high",
    purpose: "Trick users into thinking command is different",
  },
  {
    name: "Greek Lookalike: ο (o)",
    characters: [0x03bf],
    description: 'Greek omicron that looks like Latin "o"',
    risk: "high",
    purpose: "Homoglyph attack",
  },
  {
    name: "Cyrillic Lookalike: к (k)",
    characters: [0x043a],
    description: 'Cyrillic character that looks like Latin "k"',
    risk: "high",
    purpose: "Command spoofing",
  },
  {
    name: "Cyrillic Lookalike: н (n)",
    characters: [0x043d],
    description: 'Cyrillic character that looks like Latin "n"',
    risk: "high",
    purpose: "Command spoofing",
  },

  // === FORMAT CHARACTERS (LOW-MEDIUM RISK) ===
  {
    name: "Soft Hyphen",
    characters: [0x00ad],
    description: "Invisible hyphen",
    risk: "low",
    purpose: "Can hide content in line breaks",
  },
  {
    name: "Mongolian Vowel Separator",
    characters: [0x180e],
    description: "Looks like whitespace, not actually space",
    risk: "medium",
    purpose: "Bypass whitespace detection",
  },

  // === UNUSUAL WHITESPACE (LOW RISK, but suspicious in bulk) ===
  {
    name: "Non-Breaking Space",
    characters: [0x00a0],
    description: "Space that prevents line breaks",
    risk: "low",
    purpose: "Suspicious if used excessively (>10 in a row)",
  },
  {
    name: "Em Space",
    characters: [0x2003],
    description: "Wide space (1em)",
    risk: "low",
    purpose: "Can hide spacing differences",
  },
  {
    name: "Thin Space",
    characters: [0x2009],
    description: "Narrow space",
    risk: "low",
    purpose: "Can hide spacing differences",
  },

  // === ADDITIONAL BIDI MARKS ===
  {
    name: "Left-to-Right Mark",
    characters: [0x200e],
    description: "Directional mark",
    risk: "medium",
    purpose: "Bidi text control",
    cve: "CVE-2021-42574",
  },
  {
    name: "Right-to-Left Mark",
    characters: [0x200f],
    description: "Directional mark",
    risk: "medium",
    purpose: "Bidi text control",
    cve: "CVE-2021-42574",
  },
  {
    name: "Narrow No-Break Space",
    characters: [0x202f],
    description: "Non-breaking narrow space",
    risk: "low",
    purpose: "Spacing anomalies",
  },
];

export class UnicodeDetector {
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
   * Categorize finding type
   */
  private categorizeType(
    pattern: DangerousUnicodePattern,
  ): "ZERO_WIDTH" | "BIDI_CONTROL" | "HOMOGLYPH" | string {
    const name = pattern.name.toLowerCase();
    if (
      name.includes("zero-width") ||
      name.includes("soft hyphen") ||
      name.includes("word joiner")
    ) {
      return "ZERO_WIDTH";
    } else if (
      name.includes("embedding") ||
      name.includes("override") ||
      name.includes("mark") ||
      name.includes("formatting")
    ) {
      return "BIDI_CONTROL";
    } else if (name.includes("cyrillic") || name.includes("greek")) {
      return "HOMOGLYPH";
    }
    return pattern.name;
  }

  /**
   * Detect dangerous Unicode in content
   */
  detect(content: string, filePath: string = ""): DetectionResult {
    const findings: UnicodeFinding[] = [];
    const lines = content.split("\n");
    const homoglyphChars = [0x0430, 0x03bf, 0x043a, 0x043d]; // а, ο, к, н

    // Scan each character
    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const codePoint = char.codePointAt(0);

      if (!codePoint) continue;

      if (this.dangerousCodePoints.has(codePoint)) {
        const pattern = this.codePointToPattern.get(codePoint)!;

        // Skip homoglyphs if they're used in consistent script context
        if (homoglyphChars.includes(codePoint)) {
          if (!this.isSuspiciousHomoglyph(content, i)) {
            continue;
          }
        }

        const line = this.getLineNumber(content, i);
        const column = this.getColumnNumber(content, i);
        const lineContent = lines[line - 1] || "";

        // Get context (50 chars before and after)
        const contextStart = Math.max(0, i - 50);
        const contextEnd = Math.min(content.length, i + 50);
        const context = content.substring(contextStart, contextEnd);

        findings.push({
          type: this.categorizeType(pattern),
          severity: pattern.risk,
          description: pattern.description,
          purpose: pattern.purpose,
          cve: pattern.cve,
          filePath: filePath || undefined,
          line,
          column,
          lineContent: lineContent.trim(),
          character: char,
          codePoint: `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
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

    return {
      hasProblems: findings.length > 0,
      findings,
    };
  }

  /**
   * Check if a homoglyph usage is suspicious (mixed scripts)
   */
  private isSuspiciousHomoglyph(content: string, position: number): boolean {
    // Get the word containing this character
    let start = position;
    let end = position;

    while (
      start > 0 &&
      /[a-zA-Z0-9\u0400-\u04FF\u0370-\u03FF_]/.test(content[start - 1])
    ) {
      start--;
    }
    while (
      end < content.length - 1 &&
      /[a-zA-Z0-9\u0400-\u04FF\u0370-\u03FF_]/.test(content[end + 1])
    ) {
      end++;
    }

    const word = content.substring(start, end + 1);

    // Check if word has mixed Latin and Cyrillic/Greek
    const hasLatin = /[a-zA-Z_]/.test(word);
    const hasCyrillic = /[\u0400-\u04FF]/.test(word);
    const hasGreek = /[\u0370-\u03FF]/.test(word);

    // Only flag if mixing scripts
    return hasLatin && (hasCyrillic || hasGreek);
  }

  /**
   * Detect suspicious sequences (e.g., 10+ zero-width chars in a row)
   */
  private detectSuspiciousSequences(
    content: string,
    filePath: string = "",
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
          const line = this.getLineNumber(content, sequenceStart);
          findings.push({
            type: "SUSPICIOUS_SEQUENCE",
            severity: "high",
            description: `${sequenceLength} consecutive zero-width characters`,
            purpose: "Likely hidden malicious instructions",
            filePath: filePath || undefined,
            line,
            column: this.getColumnNumber(content, sequenceStart),
            lineContent: content.split("\n")[line - 1]?.trim() || "",
            character: "",
            codePoint: `Multiple (${sequenceChars
              .map((cp) => `U+${cp.toString(16).toUpperCase()}`)
              .join(", ")})`,
            position: sequenceStart,
            context: `[${sequenceLength} zero-width characters]`,
            contextStart: sequenceStart,
            contextEnd: sequenceStart + sequenceLength,
            htmlEntity: "",
            unicodeName: "Zero-Width Sequence",
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
    filePath: string = "",
  ): UnicodeFinding[] {
    const findings: UnicodeFinding[] = [];
    const bidiChars = [0x202a, 0x202b, 0x202c, 0x202d, 0x202e];

    // Count bidi characters
    let bidiCount = 0;
    const bidiPositions: number[] = [];
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
        type: "TROJAN_SOURCE",
        severity: "high",
        description: `Found ${bidiCount} bidirectional text control characters`,
        purpose: "Potential Trojan Source attack (CVE-2021-42574)",
        cve: "CVE-2021-42574",
        filePath: filePath || undefined,
        line: 1,
        column: 1,
        lineContent: "Multiple bidi controls detected",
        character: "",
        codePoint: "Multiple",
        position: 0,
        context: `${bidiCount} bidirectional control characters found at positions: ${bidiPositions.join(
          ", ",
        )}`,
        contextStart: 0,
        contextEnd: content.length,
        htmlEntity: "",
        unicodeName: "Bidirectional Controls",
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
      .join("");
  }

  /**
   * Remove dangerous Unicode from content (sanitization)
   */
  sanitize(content: string, options?: SanitizeOptions): string {
    const riskThreshold = options?.riskThreshold || "medium";

    const removeCodePoints = new Set<number>();

    for (const pattern of this.dangerousPatterns) {
      // Remove based on risk level
      if (riskThreshold === "high" && pattern.risk === "high") {
        for (const cp of pattern.characters) {
          removeCodePoints.add(cp);
        }
      } else if (
        riskThreshold === "medium" &&
        (pattern.risk === "high" || pattern.risk === "medium")
      ) {
        for (const cp of pattern.characters) {
          removeCodePoints.add(cp);
        }
      } else if (riskThreshold === "low") {
        for (const cp of pattern.characters) {
          removeCodePoints.add(cp);
        }
      }
    }

    return Array.from(content)
      .filter((char) => {
        const codePoint = char.codePointAt(0);
        return !(codePoint && removeCodePoints.has(codePoint));
      })
      .join("");
  }

  /**
   * Quick check if content has any dangerous Unicode
   */
  hasDangerousUnicode(content: string): boolean {
    for (let i = 0; i < content.length; i++) {
      const codePoint = content.codePointAt(i);
      if (codePoint && this.dangerousCodePoints.has(codePoint)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Generate a human-readable report of findings
   */
  generateReport(result: DetectionResult): string {
    if (!result.hasProblems) {
      return "✅ No Unicode anomalies detected in content.";
    }

    let report = `⚠️ Unicode anomalies detected - found ${result.findings.length} issue(s):\n\n`;

    const groupedByType = new Map<string, UnicodeFinding[]>();
    for (const finding of result.findings) {
      const key = finding.type;
      if (!groupedByType.has(key)) {
        groupedByType.set(key, []);
      }
      groupedByType.get(key)!.push(finding);
    }

    for (const [type, findings] of groupedByType) {
      report += `${type} (${findings.length}):\n`;
      for (const finding of findings) {
        report += `  • Line ${finding.line}, Column ${finding.column}: ${finding.description}\n`;
        report += `    Severity: ${finding.severity.toUpperCase()}\n`;
        if (finding.cve) {
          report += `    CVE: ${finding.cve}\n`;
        }
      }
      report += "\n";
    }

    return report;
  }

  private getLineNumber(content: string, position: number): number {
    return content.substring(0, position).split("\n").length;
  }

  private getColumnNumber(content: string, position: number): number {
    const beforePos = content.substring(0, position);
    const lastNewline = beforePos.lastIndexOf("\n");
    return position - lastNewline;
  }

  private getUnicodeName(codePoint: number): string {
    const names: Record<number, string> = {
      8203: "ZERO WIDTH SPACE",
      8204: "ZERO WIDTH NON-JOINER",
      8205: "ZERO WIDTH JOINER",
      8206: "LEFT-TO-RIGHT MARK",
      8207: "RIGHT-TO-LEFT MARK",
      8234: "LEFT-TO-RIGHT EMBEDDING",
      8235: "RIGHT-TO-LEFT EMBEDDING",
      8236: "POP DIRECTIONAL FORMATTING",
      8237: "LEFT-TO-RIGHT OVERRIDE",
      8238: "RIGHT-TO-LEFT OVERRIDE",
      8288: "WORD JOINER",
      8239: "NARROW NO-BREAK SPACE",
      65279: "ZERO WIDTH NO-BREAK SPACE",
      173: "SOFT HYPHEN",
      6158: "MONGOLIAN VOWEL SEPARATOR",
      160: "NO-BREAK SPACE",
      8195: "EM SPACE",
      8201: "THIN SPACE",
      1072: "CYRILLIC SMALL LETTER A",
      1077: "CYRILLIC SMALL LETTER IE",
      1082: "CYRILLIC SMALL LETTER KA",
      1085: "CYRILLIC SMALL LETTER EN",
      1086: "CYRILLIC SMALL LETTER O",
      1088: "CYRILLIC SMALL LETTER ER",
      1089: "CYRILLIC SMALL LETTER ES",
      1092: "CYRILLIC SMALL LETTER DE",
      1093: "CYRILLIC SMALL LETTER HA",
      959: "GREEK SMALL LETTER OMICRON",
    };
    return names[codePoint] || "UNKNOWN";
  }
}
