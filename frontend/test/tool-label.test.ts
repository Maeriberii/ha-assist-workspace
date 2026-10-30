import { describe, expect, test } from "vitest";
import { toolLabel } from "../src/utils/tool-label.js";

describe("toolLabel", () => {
  test("formats namespaces and common acronyms without changing identity", () => {
    expect(
      toolLabel({ name: "llm-ha-update-manager__ha_admin_tools__get_updates" }),
    ).toEqual({
      short: "Get updates",
      qualified: "HA Admin Tools · Get updates",
    });
    expect(toolLabel({ name: "calendar.search" }).qualified).toBe(
      "Calendar · Search",
    );
    expect(toolLabel({ name: "foo__get_status" }).qualified).toBe(
      "Foo · Get status",
    );
    expect(toolLabel({ name: "bar__get_status" }).qualified).toBe(
      "Bar · Get status",
    );
    expect(toolLabel({ name: "http_api__get_url" }).qualified).toBe(
      "HTTP API · Get URL",
    );
  });
});
