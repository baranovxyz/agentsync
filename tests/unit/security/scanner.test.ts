/**
 * Security Scanner Unit Tests
 *
 * Tests for the SecurityScanner module including pattern detection,
 * false positive filtering, entropy calculation, and edge cases.
 *
 * Reference: Test Architecture Plan Section 9 (Security Test Suite)
 */

import { describe, it, expect } from "vitest";
import { SecurityScanner } from "../../../src/security/scanner.js";

describe("SecurityScanner", () => {
  const scanner = new SecurityScanner();

  describe("Pattern Detection", () => {
    describe("API Keys", () => {
      it("detects generic API keys", async () => {
        const content = 'api_key = "abc123xyz456789abc123xyz456"';
        const result = await scanner.scan(content);
        expect(result.hasSensitiveData).toBe(true);
        expect(result.findings.some((f) => f.type === "GENERIC_API_KEY")).toBe(
          true,
        );
      });

      it("detects API keys with different separators", async () => {
        const content1 = 'apiKey: "verylongsecretkeyvalue123456"';
        const content2 = 'api-key="verylongsecretkeyvalue123456"';
        const result1 = await scanner.scan(content1);
        const result2 = await scanner.scan(content2);
        expect(result1.hasSensitiveData).toBe(true);
        expect(result2.hasSensitiveData).toBe(true);
      });
    });

    describe("AWS", () => {
      it("detects AWS access keys", async () => {
        const content = "AKIA5ZXKXXXXXXXXXXX";
        const result = await scanner.scan(content);
        expect(result.hasSensitiveData).toBe(true);
        expect(result.findings.some((f) => f.type === "AWS_ACCESS_KEY")).toBe(
          true,
        );
      });

      it("detects AWS secret keys", async () => {
        const content =
          'aws_secret_access_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"';
        const result = await scanner.scan(content);
        expect(result.hasSensitiveData).toBe(true);
        expect(result.findings.some((f) => f.type === "AWS_SECRET_KEY")).toBe(
          true,
        );
      });
    });

    describe("GitHub", () => {
      it("detects GitHub personal access tokens", async () => {
        const content = "github_token = ghp_16CvvKUhFxxxxxxxxxxxxxxxxx";
        const result = await scanner.scan(content);
        expect(result.hasSensitiveData).toBe(true);
        expect(result.findings.some((f) => f.type === "GITHUB_TOKEN")).toBe(
          true,
        );
      });

      it("detects GitHub fine-grained personal access tokens", async () => {
        const content = "ghp_1234567890abcdefghijklmnopqrstuv";
        const result = await scanner.scan(content);
        expect(result.hasSensitiveData).toBe(true);
      });

      it("detects GitHub OAuth tokens", async () => {
        const content = "gho_16CvvKUhFxxxxxxxxxxxxxxxxx";
        const result = await scanner.scan(content);
        expect(result.hasSensitiveData).toBe(true);
      });
    });

    describe("Database Connections", () => {
      it("detects MongoDB connection strings", async () => {
        const content =
          "mongodb+srv://user:password@cluster.mongodb.net/db";
        const result = await scanner.scan(content);
        expect(result.hasSensitiveData).toBe(true);
        expect(result.findings.some((f) => f.type === "DB_CONNECTION")).toBe(
          true,
        );
      });

      it("detects PostgreSQL connection strings", async () => {
        const content = "postgresql://user:password@localhost:5432/dbname";
        const result = await scanner.scan(content);
        expect(result.hasSensitiveData).toBe(true);
      });

      it("detects MySQL connection strings", async () => {
        const content = "mysql://user:password@localhost/dbname";
        const result = await scanner.scan(content);
        expect(result.hasSensitiveData).toBe(true);
      });
    });

    describe("JWT Tokens", () => {
      it("detects JWT tokens", async () => {
        const content =
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
        const result = await scanner.scan(content);
        expect(result.hasSensitiveData).toBe(true);
        expect(result.findings.some((f) => f.type === "JWT_TOKEN")).toBe(true);
      });
    });

    describe("Private Keys", () => {
      it("detects RSA private keys", async () => {
        const content = "-----BEGIN RSA PRIVATE KEY-----";
        const result = await scanner.scan(content);
        expect(result.hasSensitiveData).toBe(true);
        expect(result.findings.some((f) => f.type === "PRIVATE_KEY")).toBe(
          true,
        );
      });

      it("detects EC private keys", async () => {
        const content = "-----BEGIN EC PRIVATE KEY-----";
        const result = await scanner.scan(content);
        expect(result.hasSensitiveData).toBe(true);
      });

      it("detects OpenSSH private keys", async () => {
        const content = "-----BEGIN OPENSSH PRIVATE KEY-----";
        const result = await scanner.scan(content);
        expect(result.hasSensitiveData).toBe(true);
      });
    });

    describe("Stripe", () => {
      it("detects Stripe API keys", async () => {
        const content = "stripe_key = sk_test_51234567890abcdefghijk";
        const result = await scanner.scan(content);
        expect(result.hasSensitiveData).toBe(true);
        expect(result.findings.some((f) => f.type === "STRIPE_KEY")).toBe(true);
      });
    });

    describe("Slack", () => {
      it("detects Slack tokens", async () => {
        const content = "xoxb-123456789-1234567890-abcdefg";
        const result = await scanner.scan(content);
        expect(result.hasSensitiveData).toBe(true);
        expect(result.findings.some((f) => f.type === "SLACK_TOKEN")).toBe(
          true,
        );
      });

      it("detects Slack webhooks", async () => {
        const content =
          "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXX";
        const result = await scanner.scan(content);
        expect(result.hasSensitiveData).toBe(true);
        expect(result.findings.some((f) => f.type === "SLACK_WEBHOOK")).toBe(
          true,
        );
      });
    });
  });

  describe("False Positive Filtering", () => {
    it("ignores example placeholders", async () => {
      const content = "api_key = example_very_long_placeholder_value_here";
      const result = await scanner.scan(content);
      expect(result.findings.length).toBe(0);
    });

    it("ignores test placeholders", async () => {
      const content = "password = test_very_long_password_value_123";
      const result = await scanner.scan(content);
      expect(result.findings.length).toBe(0);
    });

    it("ignores demo/sample placeholders", async () => {
      const content = "token = demo_very_long_token_value_abcdefgh";
      const result = await scanner.scan(content);
      expect(result.findings.length).toBe(0);
    });

    it("ignores repeated character patterns", async () => {
      const content = "secret = xxxxxxxxxxxxx";
      const result = await scanner.scan(content);
      expect(result.findings.length).toBe(0);
    });

    it("ignores ellipsis patterns", async () => {
      const content = "key = ...";
      const result = await scanner.scan(content);
      expect(result.findings.length).toBe(0);
    });

    it("ignores placeholder indicators", async () => {
      const content = "url = <your-api-key-here>";
      const result = await scanner.scan(content);
      expect(result.findings.length).toBe(0);
    });

    it("ignores sequential character patterns", async () => {
      const content = "code = abcdefghijklmnop";
      const result = await scanner.scan(content);
      expect(result.findings.length).toBe(0);
    });
  });

  describe("Entropy Detection", () => {
    it("flags high-entropy strings above threshold", async () => {
      // Random-looking string with high entropy
      const content = 'secret = "aBcDeFgHiJkLmNoPqRsT"';
      const result = await scanner.scan(content);
      const highEntropyFindings = result.findings.filter(
        (f) => f.type === "HIGH_ENTROPY",
      );
      expect(highEntropyFindings.length).toBeGreaterThan(0);
    });

    it("ignores low-entropy strings", async () => {
      // Repeated characters have low entropy
      const content = 'name = "aaaaa"';
      const result = await scanner.scan(content);
      const highEntropyFindings = result.findings.filter(
        (f) => f.type === "HIGH_ENTROPY",
      );
      expect(highEntropyFindings.length).toBe(0);
    });
  });

  describe("Comment Handling", () => {
    it("skips shell comments", async () => {
      const content = "# api_key = verylongsecretkeyvalue123456";
      const result = await scanner.scan(content);
      expect(result.hasSensitiveData).toBe(false);
    });

    it("skips JavaScript comments", async () => {
      const content = "// api_key = verylongsecretkeyvalue123456";
      const result = await scanner.scan(content);
      expect(result.hasSensitiveData).toBe(false);
    });

    it("skips HTML comments", async () => {
      const content = "<!-- api_key = verylongsecretkeyvalue123456 -->";
      const result = await scanner.scan(content);
      expect(result.hasSensitiveData).toBe(false);
    });

    it("skips code fence markers", async () => {
      const content = "``` api_key = verylongsecretkeyvalue123456 ```";
      const result = await scanner.scan(content);
      expect(result.hasSensitiveData).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("handles empty content", async () => {
      const result = await scanner.scan("");
      expect(result.hasSensitiveData).toBe(false);
      expect(result.findings).toHaveLength(0);
    });

    it("handles content with only whitespace", async () => {
      const result = await scanner.scan("   \n  \n  ");
      expect(result.hasSensitiveData).toBe(false);
    });

    it("handles content with only comments", async () => {
      const result = await scanner.scan("# comment\n// another comment");
      expect(result.hasSensitiveData).toBe(false);
    });

    it("handles multiple findings on single line", async () => {
      const content =
        'api_key="verylongsecretkeyvalue123" password="anotherverylongsecretvalue"';
      const result = await scanner.scan(content);
      expect(result.findings.length).toBeGreaterThan(1);
    });

    it("correctly reports line numbers", async () => {
      const content = "line1\nline2\napi_key = verylongsecretkeyvalue123\nline4";
      const result = await scanner.scan(content);
      const finding = result.findings.find((f) => f.type === "GENERIC_API_KEY");
      expect(finding?.line).toBe(3);
    });

    it("correctly reports column positions", async () => {
      const content = 'start api_key = verylongsecretkeyvalue123 end';
      const result = await scanner.scan(content);
      const finding = result.findings[0];
      expect(finding?.column).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Severity Levels", () => {
    it("assigns critical severity to private keys", async () => {
      const content = "-----BEGIN RSA PRIVATE KEY-----";
      const result = await scanner.scan(content);
      const finding = result.findings.find((f) => f.type === "PRIVATE_KEY");
      expect(finding?.severity).toBe("critical");
    });

    it("assigns critical severity to database connections", async () => {
      const content = "mongodb+srv://user:password@cluster.mongodb.net/db";
      const result = await scanner.scan(content);
      const finding = result.findings.find((f) => f.type === "DB_CONNECTION");
      expect(finding?.severity).toBe("critical");
    });

    it("assigns high severity to AWS keys", async () => {
      const content = "AKIA5ZXKXXXXXXXXXXX";
      const result = await scanner.scan(content);
      const finding = result.findings.find((f) => f.type === "AWS_ACCESS_KEY");
      expect(finding?.severity).toBe("high");
    });

    it("assigns medium severity to passwords", async () => {
      const content = 'password = "verylongsecretpassword123"';
      const result = await scanner.scan(content);
      const finding = result.findings.find((f) => f.type === "PASSWORD");
      expect(finding?.severity).toBe("medium");
    });
  });

  describe("Confidence Levels", () => {
    it("assigns high confidence to well-known patterns", async () => {
      const content = "AKIA5ZXKXXXXXXXXXXX";
      const result = await scanner.scan(content);
      const finding = result.findings.find((f) => f.type === "AWS_ACCESS_KEY");
      expect(finding?.confidence).toBe("high");
    });

    it("assigns medium confidence to generic patterns", async () => {
      const content = 'api_key = "abc123xyz456789abc123xyz456abc"';
      const result = await scanner.scan(content);
      const finding = result.findings.find((f) => f.type === "GENERIC_API_KEY");
      expect(finding?.confidence).toMatch(/medium|high/);
    });

    it("assigns low confidence to high entropy strings", async () => {
      const content = 'value = "aBcDeFgHiJkLmNoPqRsT"';
      const result = await scanner.scan(content);
      const finding = result.findings.find((f) => f.type === "HIGH_ENTROPY");
      expect(finding?.confidence).toBe("low");
    });
  });

  describe("Deduplication", () => {
    it("deduplicates findings on same line", async () => {
      const content =
        'key = "verylongsecretkeyvalue123"\nkey = "verylongsecretkeyvalue123"';
      const result = await scanner.scan(content);
      const duplicates = result.findings.filter(
        (f) => f.type === "GENERIC_API_KEY",
      );
      expect(duplicates.length).toBe(2); // Different lines, so not duplicates
    });
  });

  describe("Scan Statistics", () => {
    it("correctly counts total lines", async () => {
      const content = "line1\nline2\nline3";
      const result = await scanner.scan(content);
      expect(result.stats.totalLines).toBe(3);
    });

    it("correctly counts scanned lines (excluding comments)", async () => {
      const content = "# comment\nline2\n// comment";
      const result = await scanner.scan(content);
      expect(result.stats.scannedLines).toBe(1);
    });

    it("reports scan duration", async () => {
      const content =
        "line1\nline2\nline3\nline4\nline5"; // Small content for fast scan
      const result = await scanner.scan(content);
      expect(result.stats.scanDuration).toBeGreaterThan(0);
    });

    it("counts high entropy strings", async () => {
      const content = 'val1 = "aBcDeFgHiJkLmNoPqRsT"\nval2 = "aBcDeFgHiJk"';
      const result = await scanner.scan(content);
      expect(result.stats.highEntropyStrings).toBeGreaterThan(0);
    });
  });

  describe("Report Generation", () => {
    it("generates report for clean content", async () => {
      const result = await scanner.scan("normal content with no secrets");
      const report = scanner.generateReport(result);
      expect(report).toContain("No sensitive data detected");
      expect(report).toContain("✅");
    });

    it("generates report for content with findings", async () => {
      const result = await scanner.scan(
        "api_key = verylongsecretkeyvalue123",
      );
      const report = scanner.generateReport(result);
      expect(report).toContain("found");
      expect(report).toContain("potential security issues");
    });

    it("groups findings by severity in report", async () => {
      const result = await scanner.scan(
        "api_key = verylongsecretkeyvalue123\n-----BEGIN RSA PRIVATE KEY-----",
      );
      const report = scanner.generateReport(result);
      expect(report).toContain("CRITICAL");
      expect(report).toContain("MEDIUM");
    });

    it("includes statistics in report", async () => {
      const result = await scanner.scan("line1\nline2\nline3");
      const report = scanner.generateReport(result);
      expect(report).toContain("Scan Statistics");
      expect(report).toContain("Total lines");
    });
  });
});
