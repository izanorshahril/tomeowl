import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { distribution, isolatedEnvironment } from "../scripts/benchmark-graphify";

test("Graphify benchmark subprocesses exclude provider credentials and user homes", () => {
  const directory = mkdtempSync(join(tmpdir(), "tomeowl-graphify-env-"));
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only-sentinel";
  try {
    const env = isolatedEnvironment(directory, true);
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.HOME).toBe(join(directory, "home"));
    expect(env.USERPROFILE).toBe(env.HOME);
    expect(env.UV_KEYRING_PROVIDER).toBe("disabled");
    expect(env.HTTP_PROXY).toBe("http://127.0.0.1:9");
    expect(env.GRAPHIFY_NO_AUTO_REFRESH).toBe("1");
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous;
    rmSync(directory, { recursive: true });
  }
});

test("Graphify benchmark keeps raw latency observations and descriptive percentiles", () => {
  const values = [1, 8, 2, 5, 3];
  expect(distribution(values)).toEqual({ samples: 5, medianMs: 3, p95Ms: 8, rawMs: values });
  expect(distribution([]).medianMs).toBeNull();
});
