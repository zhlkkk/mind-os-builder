import assert from "node:assert/strict";
import test from "node:test";
import { auditTwitterDaily } from "../../src/collect/audit.js";

const frontmatter = (count: number): string => `---
date: 2026-08-10
source: x.com/home
tweet_count: ${count}
last_updated: "08:00"
---

# X/Twitter 每日信息简报 — 2026-08-10
`;

test("Twitter 审计把 marker 作为主键且不重复统计托管来源 URL", () => {
  const content = `${frontmatter(1)}
## Agent

<!-- mindos:collect:twitter:ego-one -->
1. **发布智能体评测结果**：团队公开了可复现实验方法和测量结果。
   — [@test\\_user](<https://x.com/test_user/status/123>)

\`\`\`
<!-- mindos:collect:twitter:inside-code -->
https://x.com/example/status/999
\`\`\`

~~~text
<!-- mindos:collect:twitter:inside-tilde-code -->
https://x.com/example/status/998
~~~

\`\`\`\`markdown
\`\`\`
<!-- mindos:collect:twitter:inside-long-code -->
https://x.com/example/status/997
\`\`\`
\`\`\`\`
`;
  assert.deepEqual(auditTwitterDaily(content), {
    valid: true,
    managed_count: 1,
    unique_ids: 1,
    legacy_count: 0,
    managed_ids: ["ego-one"],
    issues: [],
  });
});

test("Twitter 审计只报告真实托管结构问题并忽略代码块和人工条目", () => {
  const content = `${frontmatter(1)}
## Agent

<!-- mindos:collect:twitter:123 -->
1. **New benchmark**：The team published results.
   — [@tester](<https://x.com/tester/status/124>)

<!-- mindos:collect:twitter:123 -->
2. **关于新基准的探讨**：作者分享了如下内容：新基准发布。
   — [@tester](<https://x.com/tester/status/123>)

<!-- mindos:collect:twitter:orphan -->

\`\`\`
<!-- mindos:collect:twitter:inside-code -->
\`\`\`

人工链接：https://x.com/human/status/999
`;
  const report = auditTwitterDaily(content);
  assert.equal(report.valid, false);
  assert.deepEqual(new Set(report.issues.map((issue) => issue.code)), new Set([
    "twitter.marker.duplicate",
    "twitter.marker.orphan",
    "twitter.marker_url.mismatch",
    "twitter.frontmatter.count",
    "twitter.display.missing_chinese",
    "twitter.display.template",
  ]));
  assert.equal(report.managed_count, 2);
  assert.equal(report.unique_ids, 1);
  assert.equal(report.legacy_count, 1);
  assert.doesNotMatch(JSON.stringify(report), /inside-code/u);
});
