/**
 * Security Scanner Module
 * Detects secrets, API keys, and sensitive information in AGENTS.md files
 */

// SecurityError imported but not used yet - will be used for throwing errors

// Common secret patterns
const SECRET_PATTERNS = {
  // API Keys
  GENERIC_API_KEY:
    /(?:api[_-]?key|apikey|api_secret)[\s]*[:=][\s]*['"]?([a-zA-Z0-9\-_]{20,})['"]?/gi,

  // AWS
  AWS_ACCESS_KEY:
    /(?:AKIA|A3T|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[0-9A-Z]{16}/g,
  AWS_SECRET_KEY:
    /(?:aws[_-]?secret[_-]?access[_-]?key)[\s]*[:=][\s]*['"]?([a-zA-Z0-9/+=]{40})['"]?/gi,

  // GitHub
  GITHUB_TOKEN:
    /(?:gh[ps]_[a-zA-Z0-9]{36,}|github[_-]?token[\s]*[:=][\s]*['"]?[a-zA-Z0-9]{40}['"]?)/gi,

  // Google
  GOOGLE_API: /AIza[0-9A-Za-z\-_]{35}/g,
  GOOGLE_OAUTH: /[0-9]+-[0-9A-Za-z_]{32}\.apps\.googleusercontent\.com/g,

  // Slack
  SLACK_TOKEN: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,34}/g,
  SLACK_WEBHOOK:
    /https:\/\/hooks\.slack\.com\/services\/T[a-zA-Z0-9_]+\/B[a-zA-Z0-9_]+\/[a-zA-Z0-9_]+/g,

  // Database
  DB_CONNECTION:
    /(?:mongodb\+srv|postgres|mysql|redis):\/\/[^:]+:[^@]+@[^/]+/gi,

  // JWT
  JWT_TOKEN: /eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]*/g,

  // Private Keys
  PRIVATE_KEY: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,

  // OAuth
  OAUTH_TOKEN:
    /(?:oauth[_-]?token|access[_-]?token)[\s]*[:=][\s]*['"]?([a-zA-Z0-9\-._~+/]{20,})['"]?/gi,

  // Passwords
  PASSWORD:
    /(?:password|passwd|pwd|pass)[\s]*[:=][\s]*['"](?![*${}])[^'"]{8,}['"]?/gi,

  // Stripe
  STRIPE_KEY: /(?:sk|pk)_(?:test|live)_[a-zA-Z0-9]{24,}/g,

  // SendGrid
  SENDGRID_KEY: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/g,

  // Twilio
  TWILIO_KEY: /SK[a-f0-9]{32}/g,

  // Generic Tokens
  BEARER_TOKEN: /bearer\s+[a-zA-Z0-9\-._~+/]{20,}/gi,

  // SSH Keys
  SSH_DSA: /ssh-dss\s+[A-Za-z0-9+/]+[=]{0,3}/g,
  SSH_RSA: /ssh-rsa\s+[A-Za-z0-9+/]+[=]{0,3}/g,
  SSH_ED25519: /ssh-ed25519\s+[A-Za-z0-9+/]+[=]{0,3}/g,
};

// False positive indicators
const FALSE_POSITIVE_INDICATORS = [
  "example",
  "test",
  "demo",
  "sample",
  "placeholder",
  "your-",
  "my-",
  "<your",
  "<insert",
  "xxx",
  "...",
  "***",
  "dummy",
  "fake",
  "mock",
];

// Entropy calculation for detecting high-entropy strings
function calculateEntropy(str: string): number {
  const frequencies: Record<string, number> = {};

  for (const char of str) {
    frequencies[char] = (frequencies[char] || 0) + 1;
  }

  let entropy = 0;
  const len = str.length;

  for (const freq of Object.values(frequencies)) {
    const probability = freq / len;
    entropy -= probability * Math.log2(probability);
  }

  return entropy;
}

export interface ScanResult {
  hasSensitiveData: boolean;
  findings: SecurityFinding[];
  findingsCount?: number;
  stats: ScanStats;
}

export type SeverityLevel = "low" | "medium" | "high" | "critical";
export type ConfidenceLevel = "low" | "medium" | "high";

export interface SecurityFinding {
  type: string;
  pattern: string;
  match: string;
  line: number;
  column: number;
  severity: SeverityLevel;
  confidence: ConfidenceLevel;
  suggestion: string;
}

export interface ScanStats {
  totalLines: number;
  scannedLines: number;
  findingsCount: number;
  highEntropyStrings: number;
  scanDuration: number;
}

export class SecurityScanner {
  private readonly entropyThreshold = 4.5;
  private readonly minSecretLength = 10;

  /**
   * Scan content for sensitive information
   */
  async scan(content: string, _filePath?: string): Promise<ScanResult> {
    const startTime = Date.now();
    const lines = content.split("\n");
    const findings: SecurityFinding[] = [];
    let highEntropyCount = 0;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Skip comments and empty lines
      if (this.isCommentOrEmpty(line)) {
        continue;
      }

      // Check for pattern matches
      for (const [patternName, pattern] of Object.entries(SECRET_PATTERNS)) {
        const matches = this.findMatches(line, pattern, lineNum + 1);

        for (const match of matches) {
          if (!this.isFalsePositive(match.match)) {
            findings.push({
              ...match,
              type: patternName,
              pattern: patternName,
              severity: this.getSeverity(patternName),
              confidence: this.getConfidence(match.match, patternName),
              suggestion: this.getSuggestion(patternName),
            });
          }
        }
      }

      // Check for high-entropy strings
      const tokens = this.extractTokens(line);
      for (const token of tokens) {
        if (token.length >= this.minSecretLength) {
          const entropy = calculateEntropy(token);
          if (entropy > this.entropyThreshold && !this.isFalsePositive(token)) {
            highEntropyCount++;
            findings.push({
              type: "HIGH_ENTROPY",
              pattern: "High Entropy String",
              match: `${token.substring(0, 20)}...`,
              line: lineNum + 1,
              column: line.indexOf(token),
              severity: "medium",
              confidence: "low",
              suggestion:
                "Review this high-entropy string to ensure it's not a secret",
            });
          }
        }
      }
    }

    const stats: ScanStats = {
      totalLines: lines.length,
      scannedLines: lines.filter((l) => !this.isCommentOrEmpty(l)).length,
      findingsCount: findings.length,
      highEntropyStrings: highEntropyCount,
      scanDuration: Date.now() - startTime,
    };

    const dedupedFindings = this.deduplicateFindings(findings);
    return {
      hasSensitiveData: dedupedFindings.length > 0,
      findings: dedupedFindings,
      findingsCount: dedupedFindings.length,
      stats,
    };
  }

  /**
   * Find pattern matches in a line
   */
  private findMatches(
    line: string,
    pattern: RegExp,
    lineNum: number,
  ): Omit<
    SecurityFinding,
    "type" | "pattern" | "severity" | "confidence" | "suggestion"
  >[] {
    const matches: Omit<
      SecurityFinding,
      "type" | "pattern" | "severity" | "confidence" | "suggestion"
    >[] = [];
    // Reset regex state and use directly (patterns are already defined with 'g' flag)
    const regex = new RegExp(pattern.source, pattern.flags);
    regex.lastIndex = 0;
    let match: RegExpExecArray | null = regex.exec(line);

    while (match !== null) {
      matches.push({
        match: match[0],
        line: lineNum,
        column: match.index,
      });
      match = regex.exec(line);
    }

    return matches;
  }

  /**
   * Check if a line is a comment or empty
   */
  private isCommentOrEmpty(line: string): boolean {
    const trimmed = line.trim();
    return (
      !trimmed ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("<!--") ||
      trimmed.startsWith("```")
    );
  }

  /**
   * Extract potential secret tokens from a line
   */
  private extractTokens(line: string): string[] {
    // Extract strings in quotes and after = or :
    const tokens: string[] = [];

    // Match quoted strings
    const quotedRegex = /['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null = quotedRegex.exec(line);
    while (match !== null) {
      tokens.push(match[1]);
      match = quotedRegex.exec(line);
    }

    // Match values after = or :
    const valueRegex = /[:=]\s*([a-zA-Z0-9\-_+/]{10,})/g;
    match = valueRegex.exec(line);
    while (match !== null) {
      tokens.push(match[1]);
      match = valueRegex.exec(line);
    }
    return tokens;
  }

  /**
   * Check if a match is likely a false positive
   */
  private isFalsePositive(match: string): boolean {
    const lowerMatch = match.toLowerCase();

    // Check for false positive indicators
    for (const indicator of FALSE_POSITIVE_INDICATORS) {
      if (lowerMatch.includes(indicator)) {
        return true;
      }
    }

    // Check for repeated characters (likely placeholder)
    if (/^(.)\1{5,}$/.test(match)) {
      return true;
    }

    // Check for sequential characters
    if (this.hasSequentialChars(match)) {
      return true;
    }

    return false;
  }

  /**
   * Check for sequential character patterns
   */
  private hasSequentialChars(str: string): boolean {
    if (str.length < 5) return false;

    let sequentialCount = 0;
    for (let i = 1; i < str.length; i++) {
      if (str.charCodeAt(i) === str.charCodeAt(i - 1) + 1) {
        sequentialCount++;
        if (sequentialCount >= 4) return true;
      } else {
        sequentialCount = 0;
      }
    }

    return false;
  }

  /**
   * Get severity level for a pattern type
   */
  private getSeverity(
    patternType: string,
  ): "low" | "medium" | "high" | "critical" {
    const criticalPatterns = ["PRIVATE_KEY", "AWS_SECRET_KEY", "DB_CONNECTION"];
    const highPatterns = [
      "AWS_ACCESS_KEY",
      "GITHUB_TOKEN",
      "STRIPE_KEY",
      "JWT_TOKEN",
    ];
    const mediumPatterns = [
      "API_KEY",
      "OAUTH_TOKEN",
      "BEARER_TOKEN",
      "PASSWORD",
    ];

    if (criticalPatterns.includes(patternType)) return "critical";
    if (highPatterns.includes(patternType)) return "high";
    if (mediumPatterns.includes(patternType)) return "medium";
    return "low";
  }

  /**
   * Get confidence level for a finding
   */
  private getConfidence(
    match: string,
    patternType: string,
  ): "low" | "medium" | "high" {
    // High confidence for well-known patterns
    const highConfidencePatterns = [
      "AWS_ACCESS_KEY",
      "GITHUB_TOKEN",
      "JWT_TOKEN",
      "STRIPE_KEY",
    ];
    if (highConfidencePatterns.includes(patternType)) {
      return "high";
    }

    // Low confidence for generic patterns or short matches
    if (match.length < 20 || patternType === "HIGH_ENTROPY") {
      return "low";
    }

    return "medium";
  }

  /**
   * Get remediation suggestion for a pattern type
   */
  private getSuggestion(patternType: string): string {
    const suggestions: Record<string, string> = {
      PRIVATE_KEY:
        "Never commit private keys. Use environment variables or secure key management systems.",
      AWS_ACCESS_KEY:
        "Use IAM roles or AWS Secrets Manager instead of hardcoded credentials.",
      AWS_SECRET_KEY:
        "Store AWS credentials in ~/.aws/credentials or use IAM roles.",
      GITHUB_TOKEN:
        "Use GitHub Apps or OAuth instead of personal access tokens when possible.",
      DB_CONNECTION:
        "Store database URLs in environment variables, not in code.",
      PASSWORD:
        "Never hardcode passwords. Use environment variables or secret management tools.",
      API_KEY:
        "Store API keys in environment variables or configuration files outside version control.",
      JWT_TOKEN:
        "JWT tokens should be generated dynamically, not stored in code.",
      OAUTH_TOKEN:
        "OAuth tokens should be obtained through the OAuth flow, not hardcoded.",
    };

    return (
      suggestions[patternType] ||
      "Remove this sensitive information and use environment variables or a secret management system."
    );
  }

  /**
   * Deduplicate findings
   */
  private deduplicateFindings(findings: SecurityFinding[]): SecurityFinding[] {
    const seen = new Set<string>();
    return findings.filter((finding) => {
      const key = `${finding.type}-${finding.line}-${finding.column}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Generate security report
   */
  generateReport(scanResult: ScanResult): string {
    const lines: string[] = [];

    lines.push("🔐 Security Scan Report");
    lines.push("=".repeat(50));
    lines.push("");

    if (!scanResult.hasSensitiveData) {
      lines.push("✅ No sensitive data detected");
    } else {
      lines.push(
        `⚠️  Found ${scanResult.findingsCount} potential security issues`,
      );
      lines.push("");

      // Group findings by severity
      const bySeverity = this.groupBySeverity(scanResult.findings);

      for (const [severity, findings] of Object.entries(bySeverity)) {
        if (findings.length > 0) {
          lines.push(
            `${this.getSeverityEmoji(severity as SeverityLevel)} ${severity.toUpperCase()}: ${findings.length} issue(s)`,
          );

          for (const finding of findings.slice(0, 5)) {
            // Show max 5 per severity
            lines.push(`  Line ${finding.line}: ${finding.type}`);
            lines.push(`    ${finding.suggestion}`);
          }

          if (findings.length > 5) {
            lines.push(`  ... and ${findings.length - 5} more`);
          }
          lines.push("");
        }
      }
    }

    lines.push("📊 Scan Statistics:");
    lines.push(`  Total lines: ${scanResult.stats.totalLines}`);
    lines.push(`  Scanned lines: ${scanResult.stats.scannedLines}`);
    lines.push(
      `  High entropy strings: ${scanResult.stats.highEntropyStrings}`,
    );
    lines.push(`  Scan duration: ${scanResult.stats.scanDuration}ms`);

    return lines.join("\n");
  }

  /**
   * Group findings by severity
   */
  private groupBySeverity(
    findings: SecurityFinding[],
  ): Record<string, SecurityFinding[]> {
    const grouped: Record<string, SecurityFinding[]> = {
      critical: [],
      high: [],
      medium: [],
      low: [],
    };

    for (const finding of findings) {
      grouped[finding.severity].push(finding);
    }

    return grouped;
  }

  /**
   * Get emoji for severity level
   */
  private getSeverityEmoji(
    severity: "low" | "medium" | "high" | "critical",
  ): string {
    const emojis = {
      critical: "🚨",
      high: "⚠️",
      medium: "⚡",
      low: "ℹ️",
    };
    return emojis[severity];
  }
}

export default SecurityScanner;
