import assert from "node:assert/strict";
import test from "node:test";
import { MindosError } from "../../src/lib/paths.js";
import { runJsonSubprocess, runSubprocess } from "../../src/lib/subprocess.js";

test("子进程仅执行 argv 并返回输出", async () => {
  const completed = await runSubprocess({ command: process.execPath, args: ["-e", "process.stdout.write('ok')"] });
  assert.equal(completed.stdout, "ok");
  assert.equal(completed.exitCode, 0);
});

test("子进程错误脱敏凭证且超量输出失败", async () => {
  await assert.rejects(
    () => runSubprocess({ command: process.execPath, args: ["-e", "process.stderr.write('Cookie: secret token=abc https://user:pass@example.test') ; process.exit(2)"] }),
    (error: unknown) => error instanceof MindosError && error.code === "mindos.provider.command_failed" && !error.message.includes("secret") && !error.message.includes("pass"),
  );
  await assert.rejects(
    () => runSubprocess({ command: process.execPath, args: ["-e", "process.stdout.write('x'.repeat(32))"], maxStdoutBytes: 8 }),
    (error: unknown) => error instanceof MindosError && error.code === "mindos.provider.output_too_large",
  );
});

test("子进程区分缺失、超时和无效 JSON", async () => {
  await assert.rejects(
    () => runSubprocess({ command: "mindos-command-that-does-not-exist" }),
    (error: unknown) => error instanceof MindosError && error.code === "mindos.dependency.unavailable",
  );
  await assert.rejects(
    () => runSubprocess({ command: process.execPath, args: ["-e", "setInterval(() => {}, 1000)"], timeoutMs: 10 }),
    (error: unknown) => error instanceof MindosError && error.code === "mindos.provider.timeout",
  );
  await assert.rejects(
    () => runJsonSubprocess({ command: process.execPath, args: ["-e", "process.stdout.write('{')"] }),
    (error: unknown) => error instanceof MindosError && error.code === "mindos.provider.invalid_output",
  );
});
