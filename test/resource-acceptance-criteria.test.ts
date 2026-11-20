import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test("committed acceptance criteria document matches the pre-registered values", async () => {
  const document = await readFile(
    join(import.meta.dir, "..", "docs/validation/resource-acceptance-criteria.md"),
    "utf8",
  );
  for (const token of [
    "10 pairs",
    "5 evaluable",
    "16",
    "250",
    "64 MiB",
    "1.0 point",
    "3×IQR",
    "30 s",
    "70 s",
    "ready",
    "steady",
  ]) {
    expect(document).toContain(token);
  }
});
