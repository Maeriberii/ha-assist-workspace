import { describe, expect, test } from "vitest";
import { prettyJson } from "../src/utils/json.js";

describe("tool inspector JSON copy", () => {
  test("uses deterministic pretty JSON and turns missing values into null", () => {
    expect(prettyJson({ enabled: true, count: 2 })).toBe(
      '{\n  "enabled": true,\n  "count": 2\n}',
    );
    expect(prettyJson(undefined)).toBe("null");
  });
});
