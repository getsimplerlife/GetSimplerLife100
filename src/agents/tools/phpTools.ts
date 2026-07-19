/**
 * PHP Legacy Code Analysis Tools
 *
 * Provides agent tools for analyzing PHP code for legacy patterns,
 * generating modernization plans, and parsing PHP-generated outputs.
 *
 * Generic tool for all agents.
 */

import { registry } from "../tools";
import type { ToolContext, ToolResult } from "../schema";

// ── PHP Legacy Patterns ──────────────────────────────────────────────────

interface LegacyPattern {
  name: string;
  pattern: RegExp;
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  description: string;
  recommendation: string;
  modernAlternative: string;
}

const LEGACY_PATTERNS: LegacyPattern[] = [
  {
    name: "mysql_* functions",
    pattern: /mysql_(connect|query|fetch_array|fetch_assoc|num_rows|select_db|close|error|real_escape_string|insert_id|affected_rows)/gi,
    severity: "critical",
    category: "Database",
    description: "Deprecated MySQL extension removed in PHP 7.0",
    recommendation: "Replace with MySQLi or PDO with prepared statements",
    modernAlternative: "mysqli_connect() / PDO",
  },
  {
    name: "ereg / eregi",
    pattern: /\bereg(i)?\b/gi,
    severity: "critical",
    category: "String Processing",
    description: "POSIX Regex functions removed in PHP 7.0",
    recommendation: "Replace with preg_match() / preg_match_all()",
    modernAlternative: "preg_match()",
  },
  {
    name: "split / join",
    pattern: /\b(split|join)\s*\(/gi,
    severity: "high",
    category: "String Processing",
    description: "split() removed in PHP 7.0, join() is an alias of implode()",
    recommendation: "Use explode() instead of split(), use implode() instead of join()",
    modernAlternative: "explode() / implode()",
  },
  {
    name: "create_function",
    pattern: /\bcreate_function\s*\(/gi,
    severity: "critical",
    category: "Functions",
    description: "create_function() removed in PHP 7.2",
    recommendation: "Replace with anonymous functions (closure)",
    modernAlternative: "fn() => or function() use (...) {}",
  },
  {
    name: "each()",
    pattern: /\beach\s*\(/gi,
    severity: "high",
    category: "Arrays",
    description: "each() removed in PHP 7.2",
    recommendation: "Use foreach() loops instead",
    modernAlternative: "foreach ($array as $key => $value)",
  },
  {
    name: "__autoload",
    pattern: /\b__autoload\b/gi,
    severity: "high",
    category: "Autoloading",
    description: "__autoload() deprecated in PHP 7.2",
    recommendation: "Replace with spl_autoload_register()",
    modernAlternative: "spl_autoload_register()",
  },
  {
    name: "Mysql result without fetch",
    pattern: /\bmysql_result\b/gi,
    severity: "high",
    category: "Database",
    description: "mysql_result() removed in PHP 7.0",
    recommendation: "Use mysqli_result or PDOStatement fetch methods",
    modernAlternative: "$stmt->fetch()",
  },
  {
    name: "magic_quotes runtime",
    pattern: /\b(get_magic_quotes_gpc|set_magic_quotes_runtime)\b/gi,
    severity: "high",
    category: "Security",
    description: "Magic quotes removed in PHP 5.4",
    recommendation: "Remove — use prepared statements for SQL, htmlspecialchars() for output",
    modernAlternative: "Prepared statements / htmlspecialchars()",
  },
  {
    name: "HTTP_*_VARS",
    pattern: /\$HTTP_(GET|POST|COOKIE|SERVER|ENV|SESSION|FILES)_VARS\b/gi,
    severity: "medium",
    category: "Superglobals",
    description: "Old-style superglobal arrays removed in PHP 5.4",
    recommendation: "Use $_GET, $_POST, $_COOKIE, $_SERVER, etc.",
    modernAlternative: "$_GET, $_POST, $_SERVER",
  },
  {
    name: "session_register / session_unregister",
    pattern: /\b(session_register|session_unregister|session_is_registered)\b/gi,
    severity: "high",
    category: "Session",
    description: "session_register() removed in PHP 5.4",
    recommendation: "Use $_SESSION superglobal directly",
    modernAlternative: "$_SESSION['key'] = value",
  },
  {
    name: "call_user_method",
    pattern: /\b(call_user_method|call_user_method_array)\b/gi,
    severity: "medium",
    category: "Functions",
    description: "call_user_method() removed in PHP 7.0",
    recommendation: "Use call_user_func() with array syntax or variable functions",
    modernAlternative: "call_user_func([$obj, 'method'], $args)",
  },
  {
    name: "define_syslog_variables",
    pattern: /\bdefine_syslog_variables\b/gi,
    severity: "low",
    category: "Logging",
    description: "Removed in PHP 5.4",
    recommendation: "Remove function call",
    modernAlternative: "Remove entirely",
  },
  {
    name: "ASP Tags",
    pattern: /<%(.+?)%>/gs,
    severity: "medium",
    category: "Syntax",
    description: "ASP tags support removed in PHP 7.0",
    recommendation: "Replace with <?php ... ?> tags",
    modernAlternative: "<?php ... ?>",
  },
  {
    name: "Short open tags",
    pattern: /^<\?(?!php|=|xml)/m,
    severity: "medium",
    category: "Syntax",
    description: "Short open tags discouraged, removed in some configs",
    recommendation: "Use full <?php tags",
    modernAlternative: "<?php",
  },
  {
    name: "var (in classes)",
    pattern: /var\s+\$\w+/gi,
    severity: "low",
    category: "Syntax",
    description: "var keyword for class properties deprecated in PHP 5, but still supported",
    recommendation: "Use public/protected/private visibility modifiers",
    modernAlternative: "public $property;",
  },
  {
    name: "Unsafe unserialize",
    pattern: /\bunserialize\s*\(/gi,
    severity: "critical",
    category: "Security",
    description: "Unserialize can lead to PHP object injection vulnerabilities",
    recommendation: "Use json_decode() for untrusted data, or validate/sanitize serialized input",
    modernAlternative: "json_decode()",
  },
  {
    name: "eval() usage",
    pattern: /\beval\s*\(/gi,
    severity: "critical",
    category: "Security",
    description: "eval() executes arbitrary PHP code and is a security risk",
    recommendation: "Avoid eval() — use callbacks, reflection, or dynamic dispatch instead",
    modernAlternative: "call_user_func() / Reflection",
  },
  {
    name: "extract() with user input",
    pattern: /\bextract\s*\(\s*\$_/gi,
    severity: "high",
    category: "Security",
    description: "extract() with $_GET/$_POST/$_REQUEST is a serious security risk",
    recommendation: "Avoid extract() entirely — reference superglobals directly",
    modernAlternative: "$_GET['key']",
  },
  {
    name: "die/exit with status code",
    pattern: /\b(die|exit)\s*[^;(]*;/gi,
    severity: "low",
    category: "Error Handling",
    description: "die()/exit() without proper error handling or status codes",
    recommendation: "Use exceptions or structured error responses",
    modernAlternative: "throw new Exception() / http_response_code()",
  },
  {
    name: "Global keyword in functions",
    pattern: /function\s+\w+[^}]*\bglobal\s+\$/gsi,
    severity: "medium",
    category: "Design",
    description: "Using global keyword indicates tight coupling and poor design",
    recommendation: "Use dependency injection or pass parameters explicitly",
    modernAlternative: "function foo($param) { ... }",
  },
];

// ── PHP Modernization Recommendations ────────────────────────────────────

// PHP version EOL map
const PHP_VERSION_EOL: Record<string, string> = {
  "5.6": "December 2018",
  "7.0": "December 2018",
  "7.1": "December 2019",
  "7.2": "November 2020",
  "7.3": "December 2021",
  "7.4": "November 2022",
  "8.0": "November 2023",
  "8.1": "December 2025",
  "8.2": "December 2026",
  "8.3": "December 2027",
  "8.4": "December 2028",
};

interface ModernizationPlan {
  currentVersion: string;
  targetVersion: string;
  steps: ModernizationStep[];
  estimatedEffort: string;
  breakingChanges: string[];
  benefits: string[];
}

interface ModernizationStep {
  stepNumber: number;
  title: string;
  description: string;
  effort: "easy" | "medium" | "hard";
  automated: boolean;
}

function generateModernizationPlan(
  detectedIssues: DetectedIssue[],
  currentVersion: string,
  targetVersion: string,
): ModernizationPlan {
  const steps: ModernizationStep[] = [];
  let stepNum = 1;

  // Steps based on version gap
  const versions = Object.keys(PHP_VERSION_EOL).sort();
  const currentIdx = versions.indexOf(currentVersion);
  const targetIdx = versions.indexOf(targetVersion);

  if (currentIdx === -1 || targetIdx === -1) {
    throw new Error(`Unknown PHP version. Supported: ${versions.join(", ")}`);
  }

  // If going from < 7.0 to 7.0+
  if (parseFloat(currentVersion) < 7.0 && parseFloat(targetVersion) >= 7.0) {
    steps.push({
      stepNumber: stepNum++,
      title: "Remove deprecated functions",
      description: "Replace mysql_*, ereg, split, create_function, and each() calls",
      effort: "medium",
      automated: true,
    });
    steps.push({
      stepNumber: stepNum++,
      title: "Update constructor syntax",
      description: "Replace PHP 4-style constructors (class name methods) with __construct()",
      effort: "medium",
      automated: false,
    });
    steps.push({
      stepNumber: stepNum++,
      title: "Fix ASP tags and short open tags",
      description: "Replace <% %> and <? with <?php",
      effort: "easy",
      automated: true,
    });
  }

  // If going from < 8.0 to 8.0+
  if (parseFloat(currentVersion) < 8.0 && parseFloat(targetVersion) >= 8.0) {
    steps.push({
      stepNumber: stepNum++,
      title: "Add type declarations",
      description: "Add PHP 8 type hints for function parameters and return types",
      effort: "hard",
      automated: false,
    });
    steps.push({
      stepNumber: stepNum++,
      title: "Replace strpos() !== false checks",
      description: "Use str_contains() (PHP 8.0+) instead of strpos() !== false pattern",
      effort: "easy",
      automated: true,
    });
    steps.push({
      stepNumber: stepNum++,
      title: "Update to match expression",
      description: "Replace verbose switch statements with match() expression where appropriate",
      effort: "medium",
      automated: false,
    });
    steps.push({
      stepNumber: stepNum++,
      title: "Convert to named arguments",
      description: "Replace positional parameter arrays with named arguments where beneficial",
      effort: "medium",
      automated: false,
    });
    steps.push({
      stepNumber: stepNum++,
      title: "Add union types and mixed type",
      description: "Update docblocks to use PHP 8 union types (string|int) and mixed type",
      effort: "medium",
      automated: false,
    });
  }

  // If going to 8.1+
  if (parseFloat(targetVersion) >= 8.1) {
    steps.push({
      stepNumber: stepNum++,
      title: "Use readonly properties",
      description: "Add readonly modifier to class properties that are set once",
      effort: "medium",
      automated: false,
    });
    steps.push({
      stepNumber: stepNum++,
      title: "Use enums instead of class constants",
      description: "Replace class constant-based options with PHP 8.1 enums",
      effort: "hard",
      automated: false,
    });
    steps.push({
      stepNumber: stepNum++,
      title: "Use first-class callable syntax",
      description: "Use $fn(...) instead of Closure::fromCallable('fn')",
      effort: "easy",
      automated: true,
    });
  }

  // If going to 8.2+
  if (parseFloat(targetVersion) >= 8.2) {
    steps.push({
      stepNumber: stepNum++,
      title: "Use readonly classes",
      description: "Add readonly modifier to classes with all readonly properties",
      effort: "easy",
      automated: false,
    });
  }

  // If going to 8.3+
  if (parseFloat(targetVersion) >= 8.3) {
    steps.push({
      stepNumber: stepNum++,
      title: "Use json_validate()",
      description: "Replace try-catch json_decode() checks with json_validate()",
      effort: "easy",
      automated: true,
    });
  }

  // Add issue-specific steps
  const securityIssues = detectedIssues.filter((i) => i.severity === "critical");
  if (securityIssues.length > 0) {
    steps.push({
      stepNumber: stepNum++,
      title: "Fix critical security issues",
      description: `Address ${securityIssues.length} critical issues: ${securityIssues.map((i) => i.name).join(", ")}`,
      effort: "hard",
      automated: false,
    });
  }

  // Estimate total effort
  const effortScores = { easy: 1, medium: 3, hard: 8 };
  const totalEffort = steps.reduce((sum, s) => sum + effortScores[s.effort], 0);
  const estimatedEffort = totalEffort < 10 ? "2-4 hours" : totalEffort < 20 ? "1-2 days" : totalEffort < 50 ? "1 week" : "2+ weeks";

  // Breaking changes
  const breakingChanges: string[] = [];
  if (parseFloat(targetVersion) >= 8.0) {
    breakingChanges.push("PHP 8 changed string/number comparison behavior");
    breakingChanges.push("Some magic methods have stricter signature requirements");
  }

  return {
    currentVersion,
    targetVersion,
    steps,
    estimatedEffort,
    breakingChanges,
    benefits: [
      "Better performance (PHP 8.x is 2-3x faster than PHP 7.x)",
      "Improved type safety with native type declarations",
      "Modern syntax reduces boilerplate code",
      "Active security support",
      "Access to latest language features",
    ],
  };
}

// ── PHP Output Parser ────────────────────────────────────────────────────

interface PHPOutputAnalysis {
  contentType: string;
  isHTML: boolean;
  isJSON: boolean;
  isXML: boolean;
  isError: boolean;
  errorInfo: string | null;
  hasWarnings: boolean;
  warnings: string[];
  outputSize: number;
  preview: string;
}

function parsePHPOutput(output: string): PHPOutputAnalysis {
  const analysis: PHPOutputAnalysis = {
    contentType: "unknown",
    isHTML: false,
    isJSON: false,
    isXML: false,
    isError: false,
    errorInfo: null,
    hasWarnings: false,
    warnings: [],
    outputSize: output.length,
    preview: output.slice(0, 500),
  };

  const trimmed = output.trim();

  // Check for PHP errors/warnings (even if mixed with HTML)
  const errorPatterns = [
    /(PHP\s+(Fatal|Parse|Warning|Notice|Error|Deprecated):)/gi,
    /(Fatal error:|Parse error:|Warning:|Notice:|Deprecated:)/gi,
    /(Uncaught\s+(\\?\w+)?\s*Exception:)/gi,
    /(Stack trace:)/gi,
  ];

  const allWarnings: string[] = [];
  for (const pattern of errorPatterns) {
    const matches = trimmed.match(pattern);
    if (matches) {
      allWarnings.push(...matches);
    }
  }

  if (allWarnings.length > 0) {
    analysis.hasWarnings = true;
    analysis.warnings = allWarnings.slice(0, 10);
    analysis.isError = allWarnings.some((w) => w.match(/(Fatal|Parse|Error)/i));
  }

  // Determine content type
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
      analysis.isJSON = true;
      analysis.contentType = "application/json";
    } catch {
      // Not JSON despite appearing so
    }
  }

  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<") && !analysis.isHTML) {
    analysis.isXML = true;
    if (!analysis.isJSON) analysis.contentType = "application/xml";
  }

  if (trimmed.startsWith("<") && (trimmed.includes("<html") || trimmed.includes("<!DOCTYPE") || trimmed.includes("<div") || trimmed.includes("<table"))) {
    analysis.isHTML = true;
    analysis.contentType = "text/html";
  }

  if (!analysis.isJSON && !analysis.isXML && !analysis.isHTML) {
    if (trimmed.match(/^[A-Za-z]/)) {
      analysis.contentType = "text/plain";
    } else {
      analysis.contentType = "binary/unknown";
    }
  }

  return analysis;
}

// ── Analysis result types ────────────────────────────────────────────────

interface DetectedIssue {
  line: number;
  name: string;
  category: string;
  severity: string;
  description: string;
  recommendation: string;
  modernAlternative: string;
  code: string;
}

// ── Tool: php_analyze ────────────────────────────────────────────────────

registry.register({
  name: "php_analyze",
  description: "Analyze PHP code for legacy patterns, deprecated functions, security vulnerabilities, and modernization opportunities. Scans for 20+ known legacy patterns with severity ratings and line-specific recommendations.",
  parameters: [
    { name: "code", type: "string", description: "PHP source code to analyze", required: true },
    { name: "filename", type: "string", description: "Optional filename for reporting context", required: false },
  ],
  handler: async (params: Record<string, any>, _ctx: ToolContext): Promise<ToolResult> => {
    const code = (params.code as string) || "";
    const filename = (params.filename as string) || "unknown.php";

    if (!code.trim()) {
      return { success: false, error: "code is required" };
    }

    const lines = code.split("\n");
    const issues: DetectedIssue[] = [];
    const uniquePatterns = new Set<string>();

    // Scan each line for legacy patterns
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      for (const pattern of LEGACY_PATTERNS) {
        // Reset lastIndex for global regex
        pattern.pattern.lastIndex = 0;
        const match = pattern.pattern.exec(line);
        if (match && !uniquePatterns.has(pattern.name)) {
          uniquePatterns.add(pattern.name);

          // Find all occurrences across all lines
          const occurrences: number[] = [];
          for (let j = 0; j < lines.length; j++) {
            pattern.pattern.lastIndex = 0;
            if (pattern.pattern.test(lines[j])) {
              occurrences.push(j + 1);
            }
          }

          issues.push({
            line: lineNum,
            name: pattern.name,
            category: pattern.category,
            severity: pattern.severity,
            description: pattern.description,
            recommendation: pattern.recommendation,
            modernAlternative: pattern.modernAlternative,
            code: line.trim().slice(0, 100),
          });
        }
      }
    }

    // Compute stats
    const severityCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const issue of issues) {
      severityCounts[issue.severity] = (severityCounts[issue.severity] || 0) + 1;
    }

    const categoryCounts: Record<string, number> = {};
    for (const issue of issues) {
      categoryCounts[issue.category] = (categoryCounts[issue.category] || 0) + 1;
    }

    // Determine PHP version based on issues
    let estimatedPHPVersion = "8.1+";
    if (issues.some((i) => i.name === "mysql_* functions" || i.name === "ereg / eregi")) {
      estimatedPHPVersion = "5.x (pre-7.0)";
    } else if (issues.some((i) => i.name === "create_function" || i.name === "each()")) {
      estimatedPHPVersion = "5.x - 7.0";
    } else if (issues.some((i) => i.name === "__autoload")) {
      estimatedPHPVersion = "7.0 - 7.1";
    }

    const totalCodeIssues = issues.length;
    const modernizationScore = Math.max(0, 100 - totalCodeIssues * 5 - severityCounts.critical * 15 - severityCounts.high * 8);

    return {
      success: true,
      data: {
        filename,
        lineCount: lines.length,
        charCount: code.length,
        estimatedPHPVersion,
        modernizationScore,
        grade: modernizationScore >= 80 ? "A" : modernizationScore >= 60 ? "B" : modernizationScore >= 40 ? "C" : modernizationScore >= 20 ? "D" : "F",
        summary: {
          totalIssues: totalCodeIssues,
          bySeverity: severityCounts,
          byCategory: categoryCounts,
        },
        issues: issues.map((i) => ({
          line: i.line,
          name: i.name,
          category: i.category,
          severity: i.severity,
          description: i.description,
          recommendation: i.recommendation,
          modernAlternative: i.modernAlternative,
          code: i.code,
        })),
        keyFindings: [
          severityCounts.critical > 0
            ? `⚠️ ${severityCounts.critical} critical security/removal issues — address immediately`
            : "✅ No critical issues found",
          severityCounts.high > 0
            ? `⚠️ ${severityCounts.high} high-severity issues — plan migration`
            : "✅ No high-severity issues",
          estimatedPHPVersion !== "8.1+"
            ? `💡 Code appears to target PHP ${estimatedPHPVersion} — upgrade recommended`
            : "✅ Code targets modern PHP version",
        ],
      },
    };
  },
});

// ── Tool: php_to_modern ──────────────────────────────────────────────────

registry.register({
  name: "php_to_modern",
  description: "Generate a modernization plan to upgrade PHP code from a legacy version to a target version. Provides step-by-step migration steps with effort estimates and automatic tool suggestions.",
  parameters: [
    { name: "currentVersion", type: "string", description: "Current PHP version (e.g., '5.6', '7.0', '7.4')", required: true },
    { name: "targetVersion", type: "string", description: "Target PHP version (e.g., '8.0', '8.1', '8.2', '8.3')", required: true },
    { name: "code", type: "string", description: "Optional PHP source code to analyze for issues and include in the plan", required: false },
    { name: "projectSize", type: "string", description: "Project size: 'small', 'medium', 'large'", required: false },
  ],
  handler: async (params: Record<string, any>, _ctx: ToolContext): Promise<ToolResult> => {
    const currentVersion = (params.currentVersion as string) || "";
    const targetVersion = (params.targetVersion as string) || "";
    const code = (params.code as string) || "";
    const projectSize = (params.projectSize as string) || "medium";

    if (!currentVersion || !targetVersion) {
      return { success: false, error: "currentVersion and targetVersion are required" };
    }

    // Validate versions
    const versions = Object.keys(PHP_VERSION_EOL);
    if (!versions.includes(currentVersion)) {
      return { success: false, error: `Unknown current PHP version '${currentVersion}'. Supported: ${versions.join(", ")}` };
    }
    if (!versions.includes(targetVersion)) {
      return { success: false, error: `Unknown target PHP version '${targetVersion}'. Supported: ${versions.join(", ")}` };
    }

    const currentIdx = versions.indexOf(currentVersion);
    const targetIdx = versions.indexOf(targetVersion);

    if (targetIdx <= currentIdx) {
      return { success: false, error: `Target version ${targetVersion} is not newer than current ${currentVersion}` };
    }

    // Analyze code if provided
    let detectedIssues: DetectedIssue[] = [];
    if (code.trim()) {
      const analysisResult = await registry.execute("php_analyze", { code, filename: "source.php" }, { userId: "", agentId: "", executionId: "", db: undefined as any });
      if (analysisResult.success && analysisResult.data) {
        detectedIssues = analysisResult.data.issues || [];
      }
    }

    // Build migration path
    const migrationPath = [];
    for (let i = currentIdx + 1; i <= targetIdx; i++) {
      migrationPath.push(versions[i]);
    }

    // Generate plan
    const plan = generateModernizationPlan(detectedIssues, currentVersion, targetVersion);

    // Estimate project-wide effort based on size multiplier
    const sizeMultipliers: Record<string, number> = { small: 1, medium: 3, large: 8 };
    const multiplier = sizeMultipliers[projectSize] || 3;

    return {
      success: true,
      data: {
        migrationPath: migrationPath.join(" → "),
        currentVersion: {
          version: currentVersion,
          endOfLife: PHP_VERSION_EOL[currentVersion],
          isEOL: new Date(PHP_VERSION_EOL[currentVersion]) < new Date(),
        },
        targetVersion: {
          version: targetVersion,
          endOfLife: PHP_VERSION_EOL[targetVersion],
        },
        plan: {
          title: `PHP ${currentVersion} → ${targetVersion} Migration Plan`,
          estimatedEffort: estimateEffort(plan.estimatedEffort, multiplier),
          projectSize,
          steps: plan.steps,
        },
        breakingChanges: plan.breakingChanges,
        benefits: plan.benefits,
        tools: [
          { name: "Rector", description: "Automated PHP refactoring tool", url: "https://getrector.org/" },
          { name: "PHP_CodeSniffer", description: "Code style detection", url: "https://github.com/squizlabs/PHP_CodeSniffer" },
          { name: "PHPStan / Psalm", description: "Static analysis for PHP 8 types", url: "https://phpstan.org/" },
          { name: "PHP Compatibility", description: "Check cross-version compatibility", url: "https://github.com/PHPCompatibility/PHPCompatibility" },
        ],
        recommendations: [
          "Run automated tools (Rector) to handle 80% of repetitive changes",
          "Set up a CI pipeline that runs PHP_CodeSniffer and PHPStan",
          "Use feature flags to roll out breaking changes incrementally",
          "Test thoroughly — PHP 8 has stricter type coercion",
          "Consider a staging environment with the new PHP version before production",
        ],
      },
    };
  },
});

function estimateEffort(base: string, multiplier: number): string {
  const numMatch = base.match(/(\d+)/);
  if (!numMatch) return base;
  const num = parseInt(numMatch[1]);
  const adjusted = num * multiplier;
  if (base.includes("hour")) return `${adjusted} hours`;
  if (base.includes("day")) return `${adjusted} days`;
  if (base.includes("week")) return `${adjusted} weeks`;
  return `${adjusted} hours`;
}

// ── Tool: php_parse_output ───────────────────────────────────────────────

registry.register({
  name: "php_parse_output",
  description: "Parse PHP-generated output to detect PHP errors, warnings, stack traces embedded in output. Also identifies content type (HTML, JSON, XML, plaintext, or error output). Useful for debugging PHP applications.",
  parameters: [
    { name: "output", type: "string", description: "PHP output (stdout/response body) to analyze", required: true },
    { name: "sourceLabel", type: "string", description: "Optional label describing where the output came from (e.g., 'API response', 'CLI script')", required: false },
  ],
  handler: async (params: Record<string, any>, _ctx: ToolContext): Promise<ToolResult> => {
    const output = (params.output as string) || "";
    const sourceLabel = (params.sourceLabel as string) || "unknown";

    if (!output.trim()) {
      return { success: false, error: "output is required" };
    }

    const analysis = parsePHPOutput(output);

    // Extract structured info if JSON
    let parsedData: any = null;
    if (analysis.isJSON) {
      try {
        parsedData = JSON.parse(output.trim());
      } catch {}
    }

    // Generate debugging recommendations
    const recommendations: string[] = [];
    if (analysis.hasWarnings) {
      recommendations.push("Check error_reporting and display_errors settings in php.ini");
      recommendations.push("Consider using error_log() instead of letting errors display");
      recommendations.push("Set up a centralized logging system (monolog, sentry)");
    }
    if (analysis.isError) {
      recommendations.push("Check the stack trace for file and line number of the error source");
      recommendations.push("Enable xdebug for more detailed stack traces during development");
    }
    if (analysis.isHTML && analysis.hasWarnings) {
      recommendations.push("Errors in HTML output may indicate issues with output buffering");
      recommendations.push("Check ob_start() / ob_end_clean() usage in the code");
    }

    return {
      success: true,
      data: {
        source: sourceLabel,
        analysis: {
          contentType: analysis.contentType,
          isHTML: analysis.isHTML,
          isJSON: analysis.isJSON,
          isXML: analysis.isXML,
          hasErrors: analysis.isError,
          hasWarnings: analysis.hasWarnings,
          warnings: analysis.warnings,
          outputSize: analysis.outputSize,
          sizeFormatted: formatBytes(analysis.outputSize),
        },
        parsedJSON: parsedData,
        preview: analysis.preview,
        recommendations,
        debuggingSummary: analysis.isError
          ? `🚨 PHP error detected in ${sourceLabel}`
          : analysis.hasWarnings
            ? `⚠️ PHP warnings detected in ${sourceLabel}`
            : `✅ Clean output from ${sourceLabel}`,
      },
    };
  },
});

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export { LEGACY_PATTERNS, generateModernizationPlan, parsePHPOutput };
