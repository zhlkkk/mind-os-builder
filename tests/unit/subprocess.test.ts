import assert from "node:assert/strict";
import test from "node:test";
import { MindosError } from "../../src/lib/paths.js";
import { runJsonSubprocess, runSubprocess } from "../../src/lib/subprocess.js";

test("子进程仅执行 argv 并返回输出", async () => {
  const argument = "; echo injected | $(touch never) `whoami`";
  const completed = await runSubprocess({ command: process.execPath, args: ["-e", "process.stdout.write(process.argv[1])", argument] });
  assert.equal(completed.stdout, argument);
  assert.equal(completed.exitCode, 0);
});

test("子进程失败不公开 Provider stderr", async () => {
  const providerStderr = "FOLO_API_KEY=folo-secret\nOPENCLI_TOKEN=opencli-secret\npassword=hunter2\nordinary provider failure detail";
  await assert.rejects(
    () => runSubprocess({ command: process.execPath, args: ["-e", "process.stderr.write(process.argv[1]); process.exit(2)", providerStderr] }),
    (error: unknown) => {
      assert.ok(error instanceof MindosError);
      assert.equal(error.code, "mindos.provider.command_failed");
      assert.equal(error.message, "provider command failed (2)");
      for (const externalContent of ["FOLO_API_KEY", "folo-secret", "OPENCLI_TOKEN", "opencli-secret", "password", "hunter2", "ordinary provider failure detail"]) {
        assert.equal(error.message.includes(externalContent), false);
      }
      return true;
    },
  );
});

test("子进程超量输出失败", async () => {
  await assert.rejects(
    () => runSubprocess({ command: process.execPath, args: ["-e", "process.stdout.write('x'.repeat(32))"], maxStdoutBytes: 8 }),
    (error: unknown) => error instanceof MindosError && error.code === "mindos.provider.output_too_large",
  );
  await assert.rejects(
    () => runSubprocess({ command: process.execPath, args: ["-e", "process.stderr.write('x'.repeat(32))"], maxStderrBytes: 8 }),
    (error: unknown) => error instanceof MindosError && error.code === "mindos.provider.output_too_large",
  );
  await assert.rejects(
    () => runSubprocess({ command: process.execPath, args: ["-e", "process.stderr.write('x'.repeat(32)); setInterval(() => {}, 1000)"], maxStderrBytes: 8, timeoutMs: 100 }),
    (error: unknown) => error instanceof MindosError && error.code === "mindos.provider.output_too_large",
  );
  await assert.rejects(
    () => runSubprocess({ command: process.execPath, args: ["-e", "process.stderr.write('x'.repeat(32)); process.exit(2)"], maxStderrBytes: 8 }),
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
