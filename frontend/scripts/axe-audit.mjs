/**
 * axe-core audit via Playwright (headless Chromium).
 * Usage: node scripts/axe-audit.mjs
 */
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.AXE_BASE || "http://127.0.0.1:5173";
const USER = process.env.AXE_USER || "admin";
const PASS = process.env.AXE_PASS || "admin";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../axe-report.json");

const ROUTES = [
  { path: "/login", name: "Login", auth: false },
  { path: "/", name: "Home", auth: true },
  { path: "/devices", name: "Devices", auth: true },
  { path: "/scans", name: "Scans", auth: true },
  { path: "/notifications", name: "Notifications", auth: true },
  { path: "/settings", name: "Settings", auth: true },
];

function summarize(results) {
  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const v of results.violations) {
    const imp = v.impact || "minor";
    if (byImpact[imp] !== undefined) byImpact[imp] += 1;
    else byImpact.minor += 1;
  }
  return byImpact;
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[autocomplete="username"]', USER);
  await page.fill('input[autocomplete="current-password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
}

async function auditPage(page, route) {
  await page.goto(`${BASE}${route.path}`, { waitUntil: "networkidle" });
  // allow glass/layout paint
  await page.waitForTimeout(400);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    .analyze();

  return {
    name: route.name,
    path: route.path,
    url: results.url,
    timestamp: results.timestamp,
    counts: {
      violations: results.violations.length,
      passes: results.passes.length,
      incomplete: results.incomplete.length,
      inapplicable: results.inapplicable.length,
      ...summarize(results),
    },
    violations: results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      tags: v.tags,
      nodes: v.nodes.slice(0, 8).map((n) => ({
        html: n.html?.slice(0, 200),
        target: n.target,
        failureSummary: n.failureSummary,
      })),
    })),
    incomplete: results.incomplete.slice(0, 10).map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.length,
    })),
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
  });
  const page = await context.newPage();

  const report = {
    base: BASE,
    ranAt: new Date().toISOString(),
    pages: [],
  };

  try {
    // unauthenticated
    report.pages.push(await auditPage(page, ROUTES[0]));

    // login then authenticated routes
    await login(page);
    for (const route of ROUTES.filter((r) => r.auth)) {
      report.pages.push(await auditPage(page, route));
    }

    // Scans with dropdown open
    await page.goto(`${BASE}/scans`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    const trigger = page.locator(".dark-dd-trigger").first();
    if (await trigger.count()) {
      await trigger.click();
      await page.waitForTimeout(200);
      const openResults = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
        .analyze();
      report.pages.push({
        name: "Scans (dropdown open)",
        path: "/scans#dropdown",
        url: openResults.url,
        counts: {
          violations: openResults.violations.length,
          passes: openResults.passes.length,
          incomplete: openResults.incomplete.length,
          ...summarize(openResults),
        },
        violations: openResults.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          helpUrl: v.helpUrl,
          nodes: v.nodes.slice(0, 8).map((n) => ({
            html: n.html?.slice(0, 200),
            target: n.target,
            failureSummary: n.failureSummary,
          })),
        })),
      });
    }
  } finally {
    await browser.close();
  }

  writeFileSync(OUT, JSON.stringify(report, null, 2), "utf8");

  // console summary
  console.log("\n=== axe-core audit ===");
  console.log(`Base: ${BASE}`);
  let totalV = 0;
  for (const p of report.pages) {
    totalV += p.counts.violations;
    const c = p.counts;
    console.log(
      `\n[${p.name}] ${p.path} — violations: ${c.violations} (critical=${c.critical ?? 0}, serious=${c.serious ?? 0}, moderate=${c.moderate ?? 0}, minor=${c.minor ?? 0})`,
    );
    for (const v of p.violations) {
      console.log(`  • [${v.impact}] ${v.id}: ${v.help}`);
      for (const n of v.nodes.slice(0, 3)) {
        console.log(`      - ${JSON.stringify(n.target)}`);
      }
    }
  }
  console.log(`\nTotal violation rules (sum over pages): ${totalV}`);
  console.log(`Full report: ${OUT}`);
  process.exit(totalV > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
