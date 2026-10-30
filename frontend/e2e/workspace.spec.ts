import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const timelineMetrics = (timeline: import("@playwright/test").Locator) =>
  timeline.evaluate((node) => ({
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
    scrollTop: node.scrollTop,
    distanceFromBottom: node.scrollHeight - node.scrollTop - node.clientHeight,
  }));

const emit = (page: import("@playwright/test").Page, event: object) =>
  page.evaluate((value) => window.workspaceHarness.emit(value), event);

const setCardWidth = (page: import("@playwright/test").Page, width: number) =>
  page.evaluate((value) => {
    const card = document.querySelector("assist-workspace-card");
    card.style.width = `${value}px`;
    card.style.height = "780px";
  }, width);

const workspaceGeometry = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const card = document.querySelector("assist-workspace-card");
    const root = card.shadowRoot;
    const rect = (selector) =>
      root.querySelector(selector).getBoundingClientRect();
    return {
      layout: rect(".layout"),
      main: rect("main"),
      sidebar: rect(".sidebar"),
      composer: rect("assist-workspace-composer"),
      inspector: root.querySelector("assist-workspace-tool-inspector")
        ? rect("assist-workspace-tool-inspector")
        : null,
    };
  });

const expectAlignedBottoms = async (
  page: import("@playwright/test").Page,
  inspectorOpen = false,
) => {
  const geometry = await workspaceGeometry(page);
  expect(
    Math.abs(geometry.layout.bottom - geometry.main.bottom),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(geometry.layout.bottom - geometry.sidebar.bottom),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(geometry.main.bottom - geometry.composer.bottom),
  ).toBeLessThanOrEqual(2);
  if (inspectorOpen) {
    expect(geometry.inspector).not.toBeNull();
    expect(
      Math.abs(geometry.layout.bottom - geometry.inspector.bottom),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(geometry.main.top - geometry.inspector.top),
    ).toBeLessThanOrEqual(2);
  } else {
    expect(geometry.inspector).toBeNull();
  }
};

test("workspace mounts with an accessible composer", async ({ page }) => {
  await page.goto("/e2e/harness.html");
  const card = page.locator("assist-workspace-card");
  await expect(card).toBeVisible();
  await expect(card.locator("textarea")).toHaveAttribute(
    "aria-label",
    "Ask Assist",
  );
  const results = await new AxeBuilder({ page })
    .include("assist-workspace-card")
    .analyze();
  expect(results.violations).toEqual([]);
});

test("composer exposes honest Send state and ignores IME confirmation Enter", async ({
  page,
}) => {
  await page.goto("/e2e/harness.html");
  const composer = page.locator("assist-workspace-composer");
  const textarea = composer.getByRole("textbox", { name: "Ask Assist" });
  const send = composer.getByRole("button", { name: "Send" });
  await expect(send).toBeDisabled();
  await textarea.fill("   ");
  await expect(send).toBeDisabled();
  await textarea.fill("IME text");
  await expect(send).toBeEnabled();
  await textarea.dispatchEvent("compositionstart");
  await textarea.press("Enter");
  expect(
    await page.evaluate(() => window.workspaceHarness.subscription()),
  ).toBeNull();
  await textarea.dispatchEvent("compositionend");
  await textarea.press("Enter");
  await expect
    .poll(() => page.evaluate(() => window.workspaceHarness.subscription()))
    .not.toBeNull();
});

test("failed and stopped turns remain visible and release the composer", async ({
  page,
}) => {
  await page.goto("/e2e/harness.html");
  const card = page.locator("assist-workspace-card");
  const textarea = card.getByRole("textbox", { name: "Ask Assist" });
  await textarea.fill("fail this request");
  await textarea.press("Enter");
  await emit(page, { event: "turn_failed", error: "private stack detail" });
  await expect(card.locator(".turn-outcome")).toHaveText("Request failed");
  await expect(card).not.toContainText("private stack detail");
  await expect(textarea).toBeEnabled();
  await textarea.fill("stop this request");
  await textarea.press("Enter");
  await emit(page, { event: "turn_stopped" });
  await expect(card.locator(".turn-outcome")).toHaveText("Stopped");
  await expect(textarea).toBeEnabled();
});

test("first-turn realtime summary updates the selected conversation title", async ({
  page,
}) => {
  await page.goto("/e2e/harness.html");
  const card = page.locator("assist-workspace-card");
  await card.locator("assist-workspace-history .new-chat").click();
  const textarea = card.getByRole("textbox", { name: "Ask Assist" });
  await textarea.fill("Привет!");
  await textarea.press("Enter");
  const subscription = await page.evaluate(() =>
    window.workspaceHarness.subscription(),
  );
  expect(subscription?.conversation_id).not.toBe("a");
  const firstUpdatedAt = new Date(Date.now() + 1000).toISOString();
  const terminalUpdatedAt = new Date(Date.now() + 2000).toISOString();
  await emit(page, {
    event: "turn_started",
    user_message: "live-user",
    text: "Привет!",
    summary: {
      id: subscription.conversation_id,
      agent_id: "test",
      title: "Привет!",
      created_at: "2026-09-06T12:00:00Z",
      updated_at: firstUpdatedAt,
      message_count: 2,
    },
  });
  await expect(
    card.locator("assist-workspace-history .chat-row.selected"),
  ).toContainText("Привет!");
  await emit(page, {
    event: "assistant_delta",
    message_id: "answer",
    delta: "Ответ",
  });
  await emit(page, {
    event: "tool_started",
    message_id: "tool-message",
    tool: { id: "tool", name: "calendar.search" },
  });
  await emit(page, {
    event: "tool_finished",
    message_id: "tool-message",
    tool: { id: "tool", name: "calendar.search", status: "completed" },
  });
  await emit(page, {
    event: "turn_completed",
    messages: [],
    summary: {
      id: subscription.conversation_id,
      agent_id: "test",
      title: "Привет!",
      created_at: "2026-09-06T12:00:00Z",
      updated_at: terminalUpdatedAt,
      message_count: 5,
    },
  });
  await expect(
    card.locator("assist-workspace-history .chat-row.selected"),
  ).toContainText("Привет!");
});

test("background turn events do not clear a New Chat draft", async ({
  page,
}) => {
  await page.goto("/e2e/harness.html");
  const card = page.locator("assist-workspace-card");
  const textarea = card.getByRole("textbox", { name: "Ask Assist" });
  await textarea.fill("background request");
  await textarea.press("Enter");
  await expect
    .poll(() => page.evaluate(() => window.workspaceHarness.subscription()))
    .not.toBeNull();

  await card.locator("assist-workspace-history .new-chat").click();
  await textarea.fill("не потеряй меня");
  for (const event of [
    { event: "assistant_delta", message_id: "answer", delta: "answer" },
    {
      event: "tool_started",
      message_id: "tool-message",
      tool: { id: "tool", name: "calendar.search" },
    },
    {
      event: "tool_finished",
      message_id: "tool-message",
      tool: { id: "tool", name: "calendar.search", status: "completed" },
    },
    { event: "turn_completed", messages: [] },
  ]) {
    await emit(page, event);
    await expect(textarea).toHaveValue("не потеряй меня");
  }
});

test("responsive modes follow card width and keep the content shell contained", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/e2e/harness.html");
  const card = page.locator("assist-workspace-card");
  for (const [width, mode] of [
    [360, "compact"],
    [560, "compact"],
    [699, "compact"],
    [700, "medium"],
    [900, "medium"],
    [1099, "medium"],
    [1100, "wide"],
    [1400, "wide"],
  ] as const) {
    await setCardWidth(page, width);
    await expect(card.locator(".workspace")).toHaveClass(
      new RegExp(`\\b${mode}\\b`),
    );
    const geometry = await card.evaluate((host) => {
      const root = host.shadowRoot;
      const workspace = root.querySelector(".workspace");
      const header = root.querySelector(".workspace-header");
      const headerBox = header.getBoundingClientRect();
      const headerButtons = [...header.querySelectorAll("button")].map(
        (button) => button.getBoundingClientRect(),
      );
      const main = root.querySelector("main");
      const composer = root.querySelector("assist-workspace-composer");
      return {
        overflow: workspace.scrollWidth - workspace.clientWidth,
        mainWidth: main.getBoundingClientRect().width,
        composerBottom: composer.getBoundingClientRect().bottom,
        mainBottom: main.getBoundingClientRect().bottom,
        headerOverflow: header.scrollWidth - header.clientWidth,
        controlsContained: headerButtons.every(
          (button) =>
            button.left >= headerBox.left - 1 &&
            button.right <= headerBox.right + 1,
        ),
      };
    });
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    expect(geometry.headerOverflow).toBeLessThanOrEqual(1);
    expect(geometry.controlsContained).toBe(true);
    expect(geometry.mainWidth).toBeGreaterThan(width < 700 ? 300 : 380);
    expect(
      Math.abs(geometry.composerBottom - geometry.mainBottom),
    ).toBeLessThanOrEqual(2);
  }
});

test("inspector overlays compact and medium cards but becomes a wide third column", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/e2e/harness.html");
  await page.evaluate(() => {
    const card = document.querySelector("assist-workspace-card");
    card.onTurnEvent(
      { id: "responsive-tool", conversationId: "a", terminal: false },
      {
        event: "tool_started",
        turn_id: "responsive-tool",
        conversation_id: "a",
        message_id: "responsive-message",
        tool: { id: "responsive-call", name: "calendar.search", request: {} },
      },
    );
  });
  const card = page.locator("assist-workspace-card");
  await card.locator("assist-workspace-tool-summary .tool-summary").click();
  await card.locator("assist-workspace-tool-summary .tool-row").click();
  await expect(card.locator("assist-workspace-tool-inspector")).toHaveAttribute(
    "open",
    "",
  );
  for (const width of [699, 700, 1099, 1100]) {
    await setCardWidth(page, width);
    await expect(card.locator(".workspace")).toHaveClass(
      new RegExp(`\\b${width < 1100 ? "compact|medium" : "wide"}\\b`),
    );
    await expect(
      card.locator("assist-workspace-tool-inspector"),
    ).toHaveAttribute("open", "");
    const geometry = await workspaceGeometry(page);
    const state = await card.evaluate((host) => {
      const root = host.shadowRoot;
      const layout = root.querySelector(".layout").getBoundingClientRect();
      const inspector = root
        .querySelector("assist-workspace-tool-inspector")
        .getBoundingClientRect();
      const main = root.querySelector("main").getBoundingClientRect();
      return {
        position: getComputedStyle(
          root.querySelector("assist-workspace-tool-inspector"),
        ).position,
        layout,
        inspector,
        main,
        overflow:
          root.querySelector(".workspace").scrollWidth -
          root.querySelector(".workspace").clientWidth,
      };
    });
    expect(state.overflow).toBeLessThanOrEqual(1);
    expect(
      Math.abs(geometry.layout.bottom - geometry.main.bottom),
    ).toBeLessThanOrEqual(2);
    if (width < 1100) {
      expect(state.position).toBe("absolute");
      expect(state.inspector.top).toBeGreaterThanOrEqual(state.layout.top);
      expect(state.inspector.bottom).toBeLessThanOrEqual(
        state.layout.bottom + 1,
      );
      expect(state.main.width).toBeGreaterThan(width < 700 ? 300 : 380);
    } else {
      await expect
        .poll(() =>
          card.evaluate(
            (host) =>
              getComputedStyle(
                host.shadowRoot.querySelector(
                  "assist-workspace-tool-inspector",
                ),
              ).position,
          ),
        )
        .toBe("static");
      expect(state.inspector.left).toBeGreaterThanOrEqual(state.main.right - 1);
    }
  }
});

test("wide inspector track interpolates on open and close", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/e2e/harness.html");
  const card = page.locator("assist-workspace-card");
  await setCardWidth(page, 1400);
  await expect(card.locator(".workspace")).toHaveClass(/wide/);
  await card.getByRole("textbox", { name: "Ask Assist" }).fill("inspect");
  await card.getByRole("textbox", { name: "Ask Assist" }).press("Enter");
  await expect
    .poll(() => page.evaluate(() => window.workspaceHarness.subscription()))
    .not.toBeNull();
  await emit(page, {
    event: "tool_started",
    message_id: "wide-message",
    tool: { id: "wide-tool", name: "calendar.search", request: {} },
  });
  await card.locator("assist-workspace-tool-summary .tool-summary").click();
  const before = await card
    .locator("main")
    .evaluate((node) => node.getBoundingClientRect().width);
  await card.locator("assist-workspace-tool-summary .tool-row").click();
  const opening = await page.evaluate(async () => {
    const host = document.querySelector("assist-workspace-card");
    const values: number[] = [];
    for (let index = 0; index < 18; index += 1) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      values.push(
        host.shadowRoot.querySelector("main").getBoundingClientRect().width,
      );
    }
    return values;
  });
  await expect(card.locator("assist-workspace-tool-inspector")).toHaveAttribute(
    "open",
    "",
  );
  const opened = opening.at(-1)!;
  expect(before).toBeGreaterThan(opened);
  expect(
    opening.some((width) => width < before - 1 && width > opened + 1),
  ).toBe(true);

  await card
    .locator("assist-workspace-tool-inspector")
    .getByRole("button", { name: "Close tool inspector" })
    .click();
  const closing = await page.evaluate(async () => {
    const host = document.querySelector("assist-workspace-card");
    const values: number[] = [];
    for (let index = 0; index < 18; index += 1) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      values.push(
        host.shadowRoot.querySelector("main").getBoundingClientRect().width,
      );
    }
    return values;
  });
  const closed = closing.at(-1)!;
  expect(closed).toBeGreaterThan(opened);
  expect(
    closing.some((width) => width > opened + 1 && width < closed - 1),
  ).toBe(true);
});

test("sequential tool rounds stay in one live cluster and route later steps", async ({
  page,
}) => {
  await page.goto("/e2e/harness.html");
  const card = page.locator("assist-workspace-card");
  await card.getByRole("textbox", { name: "Ask Assist" }).fill("cluster");
  await card.getByRole("textbox", { name: "Ask Assist" }).press("Enter");
  await expect
    .poll(() => page.evaluate(() => window.workspaceHarness.subscription()))
    .not.toBeNull();
  const turn = { id: "cluster-turn", conversationId: "a", terminal: false };
  for (let index = 1; index <= 5; index += 1) {
    await emit(page, {
      event: "tool_started",
      turn_id: turn.id,
      conversation_id: turn.conversationId,
      message_id: `cluster-message-${index}`,
      tool: {
        id: `cluster-tool-${index}`,
        name: `calendar.step_${index}`,
        request: {},
      },
    });
    await emit(page, {
      event: "tool_finished",
      turn_id: turn.id,
      conversation_id: turn.conversationId,
      message_id: `cluster-message-${index}`,
      tool: {
        id: `cluster-tool-${index}`,
        name: `calendar.step_${index}`,
        status: "completed",
        response: {},
        duration_ms: 100,
      },
    });
  }
  const summaries = card.locator("assist-workspace-tool-summary");
  await expect(summaries).toHaveCount(1);
  await expect(summaries.locator(".tool-summary")).toContainText(
    "5 tools · 5 steps",
  );
  await expect(summaries.locator(".chip").first()).toHaveAttribute(
    "aria-label",
    /completed/,
  );
  await summaries.locator(".tool-summary").click();
  await expect(summaries.locator(".step")).toHaveCount(5);
  await summaries.locator(".tool-row").nth(3).click();
  await expect(card.locator("assist-workspace-tool-inspector")).toHaveAttribute(
    "open",
    "",
  );
  await card
    .locator("assist-workspace-tool-inspector")
    .getByRole("button", { name: "Metadata" })
    .click();
  await expect(card.locator("assist-workspace-tool-inspector")).toContainText(
    "calendar.step_4",
  );

  await emit(page, {
    event: "tool_started",
    turn_id: turn.id,
    conversation_id: turn.conversationId,
    message_id: "cluster-message-6",
    tool: { id: "cluster-tool-6", name: "calendar.step_6", request: {} },
  });
  await expect(summaries.locator(".step")).toHaveCount(6);

  await emit(page, {
    event: "assistant_delta",
    turn_id: turn.id,
    conversation_id: turn.conversationId,
    message_id: "cluster-visible",
    delta: "Checking one more thing",
  });
  await emit(page, {
    event: "tool_started",
    turn_id: turn.id,
    conversation_id: turn.conversationId,
    message_id: "cluster-message-7",
    tool: { id: "cluster-tool-7", name: "calendar.step_7", request: {} },
  });
  await expect(card.locator("assist-workspace-tool-summary")).toHaveCount(2);
});

test("disabling tool activity hides presentation but keeps assistant text", async ({
  page,
}) => {
  await page.goto("/e2e/harness.html");
  const card = page.locator("assist-workspace-card");
  await card.evaluate((host) =>
    host.setConfig({ agent_id: "test", show_tool_activity: false }),
  );
  await card.getByRole("textbox", { name: "Ask Assist" }).fill("text only");
  await card.getByRole("textbox", { name: "Ask Assist" }).press("Enter");
  await expect
    .poll(() => page.evaluate(() => window.workspaceHarness.subscription()))
    .not.toBeNull();
  await emit(page, {
    event: "tool_started",
    message_id: "hidden-tool-message",
    tool: { id: "hidden-tool", name: "calendar.hidden", request: {} },
  });
  await emit(page, {
    event: "assistant_delta",
    message_id: "hidden-answer",
    delta: "Visible answer remains",
  });
  await expect(card.locator("assist-workspace-tool-summary")).toHaveCount(0);
  await expect(card).toContainText("Visible answer remains");
  await expect(card.locator("assist-workspace-tool-inspector")).toHaveCount(0);
});

test("backend search mode renders safe title and message explanations", async ({
  page,
}) => {
  await page.goto("/e2e/harness.html");
  const history = page.locator("assist-workspace-history");
  const search = history.getByRole("textbox", { name: "Search chats" });

  await search.fill("alpha");
  await expect(history.locator(".search-heading")).toHaveText("Search results");
  await expect(history.locator(".chat-row")).toHaveCount(1);
  await expect(history.locator(".chat-title mark")).toHaveText("Alpha");
  await expect(history.locator(".history-heading")).toHaveCount(0);

  await search.fill("СЕКРЕТНЫЙ МАЯК");
  await expect(history.locator(".chat-row")).toHaveCount(1);
  await expect(history.locator(".result-snippet")).toContainText(
    "секретный маяк",
  );
  await expect(history.locator(".result-snippet mark")).toHaveText(
    "секретный маяк",
  );

  await search.fill("absent-result");
  await expect(history.locator(".no-results")).toHaveText("No results");
  await history.getByRole("button", { name: "Clear search" }).click();
  await expect(history.locator(".history-heading").first()).toBeVisible();
  await expect(history.locator(".search-heading")).toHaveCount(0);
});

test("latest debounced search wins and selecting a compact result closes the drawer", async ({
  page,
}) => {
  await page.goto("/e2e/harness.html");
  await setCardWidth(page, 560);
  await page.evaluate(() => {
    window.workspaceHarness.deferSearch("a");
    window.workspaceHarness.deferSearch("ab");
  });
  const card = page.locator("assist-workspace-card");
  const history = card.locator("assist-workspace-history");
  await card.getByRole("button", { name: "History" }).click();
  const search = history.getByRole("textbox", { name: "Search chats" });
  await search.fill("a");
  await page.waitForTimeout(250);
  await search.fill("ab");
  await page.waitForTimeout(250);
  await page.evaluate(() =>
    window.workspaceHarness.resolveSearch("ab", [
      {
        id: "b",
        agent_id: "test",
        title: "Bravo AB",
        messages: [],
      },
    ]),
  );
  await expect(history.locator(".chat-title")).toContainText("Bravo AB");
  await page.evaluate(() =>
    window.workspaceHarness.resolveSearch("a", [
      { id: "a", agent_id: "test", title: "Stale A", messages: [] },
    ]),
  );
  await expect(history.locator(".chat-title")).toContainText("Bravo AB");
  await history.locator(".chat-title").click();
  await expect(card.locator(".workspace")).not.toHaveClass(/sidebar-open/);
  await expect(
    card.locator("assist-workspace-message-list .messages"),
  ).toBeVisible();
});

test("closed inspector never creates an implicit layout row", async ({
  page,
}) => {
  await page.goto("/e2e/harness.html");
  await expectAlignedBottoms(page);

  await page
    .locator("assist-workspace-card assist-workspace-history .new-chat")
    .click();
  await expectAlignedBottoms(page);
  await page
    .locator("assist-workspace-card")
    .getByRole("button", { name: "Fullscreen" })
    .click();
  await expectAlignedBottoms(page);

  await page.goto("/e2e/harness.html");
  await page.evaluate(() => {
    const card = document.querySelector("assist-workspace-card");
    card.onTurnEvent(
      { id: "layout-tool", conversationId: "a", terminal: false },
      {
        event: "tool_started",
        turn_id: "layout-tool",
        conversation_id: "a",
        message_id: "layout-tool-message",
        tool: { id: "layout-call", name: "calendar.search", request: {} },
      },
    );
  });
  const card = page.locator("assist-workspace-card");
  await card
    .locator(
      "assist-workspace-message-list assist-workspace-tool-summary .tool-summary",
    )
    .click();
  await card
    .locator(
      "assist-workspace-message-list assist-workspace-tool-summary .tool-row",
    )
    .click();
  await expectAlignedBottoms(page, true);
});

test("streaming respects manual scroll and catches up in one click", async ({
  page,
}) => {
  await page.goto("/e2e/harness.html?long=1");
  const card = page.locator("assist-workspace-card");
  const list = card.locator("assist-workspace-message-list");
  const timeline = list.locator(".messages");
  await expect
    .poll(async () => (await timelineMetrics(timeline)).scrollHeight)
    .toBeGreaterThan((await timelineMetrics(timeline)).clientHeight);
  await timeline.hover();
  await page.mouse.wheel(0, 100_000);
  await expect
    .poll(async () => (await timelineMetrics(timeline)).distanceFromBottom)
    .toBeLessThanOrEqual(1);

  const textarea = card.locator("assist-workspace-composer textarea");
  await textarea.fill("stream this answer");
  await textarea.press("Enter");
  await emit(page, {
    event: "turn_started",
    user_message: "live-user",
    text: "stream this answer",
  });
  await emit(page, {
    event: "assistant_delta",
    message_id: "streamed",
    delta: "first delta",
  });
  await expect
    .poll(async () => (await timelineMetrics(timeline)).distanceFromBottom)
    .toBeLessThanOrEqual(1);

  await timeline.hover();
  await page.mouse.wheel(0, -700);
  await expect
    .poll(async () => (await timelineMetrics(timeline)).distanceFromBottom)
    .toBeGreaterThan(96);
  await expect(list.locator(".jump-to-latest")).toHaveText("↓");
  const detachedTop = (await timelineMetrics(timeline)).scrollTop;
  await emit(page, {
    event: "assistant_delta",
    message_id: "streamed",
    delta: "\n\nsecond delta while detached",
  });
  await expect(list.locator(".jump-to-latest")).toHaveText("↓ New messages");
  await expect
    .poll(async () => (await timelineMetrics(timeline)).scrollTop)
    .toBe(detachedTop);

  await timeline.hover();
  await page.mouse.wheel(0, 100_000);
  await expect(list.locator(".jump-to-latest")).toBeHidden();
  await emit(page, {
    event: "assistant_delta",
    message_id: "streamed",
    delta: "\n\nthird delta after manual return",
  });
  await expect
    .poll(async () => (await timelineMetrics(timeline)).distanceFromBottom)
    .toBeLessThanOrEqual(1);

  await timeline.hover();
  await page.mouse.wheel(0, -700);
  await emit(page, {
    event: "assistant_delta",
    message_id: "streamed",
    delta: "\n\nfourth delta before catch-up",
  });
  await expect(list.locator(".jump-to-latest")).toHaveText("↓ New messages");
  const heightBeforeJump = (await timelineMetrics(timeline)).scrollHeight;
  await list.locator(".jump-to-latest").click();
  expect((await timelineMetrics(timeline)).scrollHeight).toBe(heightBeforeJump);
  await expect
    .poll(async () => (await timelineMetrics(timeline)).distanceFromBottom)
    .toBeLessThanOrEqual(1);
  await emit(page, {
    event: "assistant_delta",
    message_id: "streamed",
    delta: "\n\nfifth delta after catch-up",
  });
  await expect
    .poll(async () => (await timelineMetrics(timeline)).distanceFromBottom)
    .toBeLessThanOrEqual(1);
});

test("plain wheel scrolling while detached does not continuously rerender", async ({
  page,
}) => {
  await page.goto("/e2e/harness.html?long=1");
  const list = page.locator(
    "assist-workspace-card assist-workspace-message-list",
  );
  const timeline = list.locator(".messages");
  await timeline.hover();
  await page.mouse.wheel(0, 100_000);
  await page.evaluate(() => {
    const list = document
      .querySelector("assist-workspace-card")
      .shadowRoot.querySelector("assist-workspace-message-list");
    window.workspaceHarness.messageListUpdates = 0;
    const original = list.update.bind(list);
    list.update = (...args) => {
      window.workspaceHarness.messageListUpdates += 1;
      return original(...args);
    };
  });
  await page.mouse.wheel(0, -500);
  await expect(list.locator(".jump-to-latest")).toBeVisible();
  await page.mouse.wheel(0, -300);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(100);
  expect(
    await page.evaluate(() => window.workspaceHarness.messageListUpdates),
  ).toBe(1);
});

test("equivalent hass and conversation refreshes do not invent unread state", async ({
  page,
}) => {
  await page.goto("/e2e/harness.html?long=1");
  const card = page.locator("assist-workspace-card");
  const list = card.locator("assist-workspace-message-list");
  const timeline = list.locator(".messages");
  await timeline.hover();
  await page.mouse.wheel(0, 100_000);
  await page.mouse.wheel(0, -700);
  await expect(list.locator(".jump-to-latest")).toHaveText("↓");
  const initialLists = await page.evaluate(
    () =>
      window.workspaceHarness
        .requests()
        .filter(
          (request) => request.type === "assist_workspace/conversation/list",
        ).length,
  );
  await page.evaluate(() => window.workspaceHarness.replaceHass());
  await page.waitForTimeout(100);
  expect(
    await page.evaluate(
      () =>
        window.workspaceHarness
          .requests()
          .filter(
            (request) => request.type === "assist_workspace/conversation/list",
          ).length,
    ),
  ).toBe(initialLists);
  await page.evaluate(() =>
    document.querySelector("assist-workspace-card").refreshServerData(),
  );
  await expect(list.locator(".jump-to-latest")).toHaveText("↓");
  await page.evaluate(() => {
    const card = document.querySelector("assist-workspace-card");
    card.onTurnEvent(
      { id: "real-revision", conversationId: "a", terminal: false },
      {
        event: "assistant_delta",
        turn_id: "real-revision",
        conversation_id: "a",
        message_id: "real-advance",
        delta: "actual new content",
      },
    );
  });
  await expect(list.locator(".jump-to-latest")).toHaveText("↓ New messages");
});

test("live inspector updates, navigation closes it, and Escape respects layer priority", async ({
  page,
}) => {
  await page.goto("/e2e/harness.html");
  const card = page.locator("assist-workspace-card");
  await card.getByRole("button", { name: "Fullscreen" }).click();
  await page.evaluate(() => {
    const card = document.querySelector("assist-workspace-card");
    card.onTurnEvent(
      { id: "live-inspector", conversationId: "a", terminal: false },
      {
        event: "tool_started",
        turn_id: "live-inspector",
        conversation_id: "a",
        message_id: "live-inspector-message",
        tool: { id: "live-inspector-tool", name: "calendar.search" },
      },
    );
  });
  await card.locator("assist-workspace-tool-summary .tool-summary").click();
  await card.locator("assist-workspace-tool-summary .tool-row").click();
  const inspector = card.locator("assist-workspace-tool-inspector");
  await inspector.getByRole("button", { name: "Response" }).click();
  await page.evaluate(() => {
    const card = document.querySelector("assist-workspace-card");
    card.onTurnEvent(
      { id: "live-inspector", conversationId: "a", terminal: false },
      {
        event: "tool_finished",
        turn_id: "live-inspector",
        conversation_id: "a",
        message_id: "live-inspector-message",
        tool: {
          id: "live-inspector-tool",
          name: "calendar.search",
          status: "completed",
          response: { live_update: true },
        },
      },
    );
  });
  await expect(inspector.locator("json-viewer")).toContainText("live_update");
  await page.keyboard.press("Escape");
  await expect(inspector).toHaveCount(0);
  await expect(card.locator(".workspace")).toHaveClass(/fullscreen/);
  await page.keyboard.press("Escape");
  await expect(card.locator(".workspace")).not.toHaveClass(/fullscreen/);

  await page.evaluate(() => {
    const card = document.querySelector("assist-workspace-card");
    card.onTurnEvent(
      { id: "nav-inspector", conversationId: "a", terminal: false },
      {
        event: "tool_started",
        turn_id: "nav-inspector",
        conversation_id: "a",
        message_id: "nav-message",
        tool: { id: "nav-tool", name: "calendar.search" },
      },
    );
  });
  // The new round remains inside the already expanded tool activity cluster.
  await card.locator("assist-workspace-tool-summary .tool-row").last().click();
  await card.locator("assist-workspace-history .chat-title").nth(1).click();
  await expect(inspector).toHaveCount(0);

  await card.getByRole("button", { name: "Fullscreen" }).click();
  await card.locator("assist-workspace-history .chat-menu").first().click();
  await card
    .locator("assist-workspace-conversation-menu")
    .getByRole("button", { name: "Rename" })
    .click();
  const dialogs = card.locator("assist-workspace-dialogs");
  await expect(dialogs.locator(".dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialogs.locator(".dialog")).toHaveCount(0);
  await expect(card.locator(".workspace")).toHaveClass(/fullscreen/);
});

test("compact New Chat closes its drawer and narrow dialogs stay inside the card", async ({
  page,
}) => {
  await page.goto("/e2e/harness.html");
  await setCardWidth(page, 360);
  const card = page.locator("assist-workspace-card");
  await card.getByRole("button", { name: "History" }).click();
  await expect(card.locator(".workspace")).toHaveClass(/sidebar-open/);
  await card.locator("assist-workspace-history .new-chat").click();
  await expect(card.locator(".workspace")).not.toHaveClass(/sidebar-open/);
  await expect(
    card.locator("assist-workspace-message-list .empty"),
  ).toBeVisible();

  await card.getByRole("button", { name: "History" }).click();
  await card.locator("assist-workspace-history .chat-menu").first().click();
  await card
    .locator("assist-workspace-conversation-menu")
    .getByRole("button", { name: "Rename" })
    .click();
  const dialog = card.locator("assist-workspace-dialogs .dialog");
  const bounds = await Promise.all([card.boundingBox(), dialog.boundingBox()]);
  expect(bounds[1].x).toBeGreaterThanOrEqual(bounds[0].x);
  expect(bounds[1].x + bounds[1].width).toBeLessThanOrEqual(
    bounds[0].x + bounds[0].width + 1,
  );
});

test("long Markdown and tool content cannot widen a compact card", async ({
  page,
}) => {
  await page.goto("/e2e/harness.html");
  await setCardWidth(page, 360);
  await page.evaluate(() => {
    const card = document.querySelector("assist-workspace-card");
    const long = "x".repeat(500);
    card.onTurnEvent(
      { id: "long-content", conversationId: "a", terminal: false },
      {
        event: "assistant_delta",
        turn_id: "long-content",
        conversation_id: "a",
        message_id: "long-content-message",
        delta: `https://example.com/${long}\n\n${long}\n\n| ${long} | value |\n|---|---|\n| cell | value |\n\n![wide](https://example.com/wide.png)`,
      },
    );
    card.onTurnEvent(
      { id: "long-content", conversationId: "a", terminal: false },
      {
        event: "tool_started",
        turn_id: "long-content",
        conversation_id: "a",
        message_id: "long-tool-message",
        tool: { id: "long-tool", name: `tool.${long}`, status: "running" },
      },
    );
  });
  const card = page.locator("assist-workspace-card");
  await card.locator("assist-workspace-tool-summary .tool-summary").click();
  await card.locator("assist-workspace-tool-summary .tool-row").click();
  await expect(card.locator("assist-workspace-tool-inspector")).toHaveAttribute(
    "open",
    "",
  );
  await page.waitForTimeout(200);
  const containment = await card.evaluate((host) => {
    const root = host.shadowRoot;
    const workspace = root.querySelector(".workspace");
    const list = root.querySelector("assist-workspace-message-list");
    const messages = list.shadowRoot.querySelector(".messages");
    const image = list.shadowRoot.querySelector("img");
    const inspector = root.querySelector("assist-workspace-tool-inspector");
    const inspectorBox = inspector.getBoundingClientRect();
    const closeBox = inspector.shadowRoot
      .querySelector("header button")
      .getBoundingClientRect();
    return {
      workspaceOverflow: workspace.scrollWidth - workspace.clientWidth,
      messagesOverflow: messages.scrollWidth - messages.clientWidth,
      imageContained:
        !image ||
        image.getBoundingClientRect().width <=
          messages.getBoundingClientRect().width,
      inspectorCloseContained:
        closeBox.left >= inspectorBox.left - 1 &&
        closeBox.right <= inspectorBox.right + 1,
    };
  });
  expect(containment.workspaceOverflow).toBeLessThanOrEqual(1);
  expect(containment.messagesOverflow).toBeLessThanOrEqual(1);
  expect(containment.imageContained).toBe(true);
  expect(containment.inspectorCloseContained).toBe(true);
});

test("reduced motion disables layout, drawer, tool and activity animation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/e2e/harness.html");
  await setCardWidth(page, 560);
  await page.evaluate(() => {
    const card = document.querySelector("assist-workspace-card");
    card.onTurnEvent(
      { id: "motion", conversationId: "a", terminal: false },
      {
        event: "tool_started",
        turn_id: "motion",
        conversation_id: "a",
        message_id: "motion-tool",
        tool: { id: "motion-call", name: "calendar.search", status: "running" },
      },
    );
  });
  const styles = await page
    .locator("assist-workspace-card")
    .evaluate((host) => {
      const root = host.shadowRoot;
      const list = root.querySelector("assist-workspace-message-list");
      const tool = list.shadowRoot.querySelector(
        "assist-workspace-tool-summary",
      );
      return {
        layout: getComputedStyle(root.querySelector(".layout"))
          .transitionDuration,
        sidebar: getComputedStyle(root.querySelector(".sidebar"))
          .transitionDuration,
        tool: getComputedStyle(tool.shadowRoot.querySelector(".chip"))
          .animationName,
      };
    });
  expect(styles.layout).toBe("0s");
  expect(styles.sidebar).toBe("0s");
  expect(styles.tool).toBe("none");
});

test("latest conversation selection wins an A to B refresh race", async ({
  page,
}) => {
  await page.goto("/e2e/harness.html");
  await page.evaluate(() => window.workspaceHarness.deferGet("b"));
  const card = page.locator("assist-workspace-card");
  const chats = card.locator("assist-workspace-history .chat-title");
  await chats.nth(1).click();
  await chats.nth(0).click();
  await page.evaluate(() =>
    window.workspaceHarness.resolveGet("b", {
      id: "b",
      agent_id: "test",
      title: "Stale Bravo",
      messages: [],
    }),
  );
  await expect(
    card.locator("assist-workspace-history .chat-row.selected"),
  ).toContainText("Alpha");
  await expect(card.locator("assist-workspace-history")).not.toContainText(
    "Stale Bravo",
  );
});

test("conversation switch resets a real detached timeline", async ({
  page,
}) => {
  await page.goto("/e2e/harness.html?long=1");
  const card = page.locator("assist-workspace-card");
  const list = card.locator("assist-workspace-message-list");
  const timeline = list.locator(".messages");
  await timeline.hover();
  await page.mouse.wheel(0, 100_000);
  await page.mouse.wheel(0, -700);
  await expect
    .poll(async () => (await timelineMetrics(timeline)).distanceFromBottom)
    .toBeGreaterThan(96);

  const textarea = card.locator("assist-workspace-composer textarea");
  await textarea.fill("background stream");
  await textarea.press("Enter");
  await emit(page, {
    event: "turn_started",
    user_message: "switch-user",
    text: "background stream",
  });
  await emit(page, {
    event: "assistant_delta",
    message_id: "switch-answer",
    delta: "new detached content",
  });
  await expect(list.locator(".jump-to-latest")).toBeVisible();

  await card.locator("assist-workspace-history .chat-title").nth(1).click();
  await expect(
    card.locator("assist-workspace-history .chat-row.selected"),
  ).toContainText("Bravo");
  await expect(list.locator(".jump-to-latest")).toBeHidden();
  await expect
    .poll(async () => (await timelineMetrics(timeline)).distanceFromBottom)
    .toBeLessThanOrEqual(1);
});

test("chat lanes, integrated composer and fullscreen rail keep their bounds", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/e2e/harness.html");
  const card = page.locator("assist-workspace-card");
  await page.evaluate(() => {
    const card = document.querySelector("assist-workspace-card");
    card.onTurnEvent(
      { id: "turn-a", conversationId: "a", terminal: false },
      {
        event: "assistant_delta",
        turn_id: "turn-a",
        conversation_id: "a",
        message_id: "answer",
        delta: "A left aligned answer",
      },
    );
  });
  const lanes = await page.evaluate(() => {
    const card = document.querySelector("assist-workspace-card");
    const list = card.shadowRoot.querySelector("assist-workspace-message-list");
    const root = list.shadowRoot;
    const user = root.querySelector(".message.user");
    const assistant = root.querySelector(".message.assistant");
    const composer = card.shadowRoot.querySelector("assist-workspace-composer");
    const shell = composer.shadowRoot.querySelector(".composer-shell");
    const button = composer.shadowRoot.querySelector(".send");
    const userBox = user.getBoundingClientRect();
    const assistantBox = assistant.getBoundingClientRect();
    const shellBox = shell.getBoundingClientRect();
    const buttonBox = button.getBoundingClientRect();
    return {
      userRight: userBox.right,
      assistantLeft: assistantBox.left,
      shellLeft: shellBox.left,
      shellRight: shellBox.right,
      buttonLeft: buttonBox.left,
      buttonRight: buttonBox.right,
      userWidth: userBox.width,
      userText: user.textContent.trim(),
    };
  });
  expect(lanes.userText).toContain("Hi");
  expect(lanes.userWidth).toBeLessThan(300);
  expect(lanes.userRight).toBeGreaterThan(lanes.assistantLeft);
  expect(lanes.buttonLeft).toBeGreaterThanOrEqual(lanes.shellLeft);
  expect(lanes.buttonRight).toBeLessThanOrEqual(lanes.shellRight);

  const composer = card.locator("assist-workspace-composer");
  const textarea = composer.locator("textarea");
  await textarea.fill("one\ntwo\nthree\nfour\nfive\nsix");
  await expect
    .poll(() =>
      textarea.evaluate((node) => node.getBoundingClientRect().height),
    )
    .toBeLessThanOrEqual(144);
  await expect
    .poll(() =>
      textarea.evaluate((node) => node.getBoundingClientRect().height),
    )
    .toBeGreaterThan(48);

  await card.getByRole("button", { name: "Fullscreen" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const card = document.querySelector("assist-workspace-card");
        return card.shadowRoot
          .querySelector("assist-workspace-message-list")
          .getBoundingClientRect().width;
      }),
    )
    .toBeLessThanOrEqual(1080);
});

test("message Copy stays below its content and reports success or failure per action", async ({
  page,
}) => {
  await page.goto("/e2e/harness.html");
  await page.evaluate(() => {
    const card = document.querySelector("assist-workspace-card");
    card.onTurnEvent(
      { id: "copy-turn", conversationId: "a", terminal: false },
      {
        event: "assistant_delta",
        turn_id: "copy-turn",
        conversation_id: "a",
        message_id: "copy-answer",
        delta: "Assistant copy text",
      },
    );
  });
  const list = page.locator(
    "assist-workspace-card assist-workspace-message-list",
  );
  const userCopy = list.locator(".user .copy");
  const assistantCopy = list.locator(".assistant .copy");
  const geometry = await list.evaluate((host) => {
    const bubble = host.shadowRoot.querySelector(".user .content");
    const userCopy = host.shadowRoot.querySelector(".user .copy");
    const assistantContent = host.shadowRoot.querySelector(
      ".assistant .content",
    );
    const assistantCopy = host.shadowRoot.querySelector(".assistant .copy");
    const bubbleBox = bubble.getBoundingClientRect();
    const userCopyBox = userCopy.getBoundingClientRect();
    const assistantContentBox = assistantContent.getBoundingClientRect();
    const assistantCopyBox = assistantCopy.getBoundingClientRect();
    return {
      bubbleWidth: bubbleBox.width,
      userCopyTop: userCopyBox.top,
      userCopyRight: userCopyBox.right,
      bubbleBottom: bubbleBox.bottom,
      bubbleRight: bubbleBox.right,
      assistantGap: assistantCopyBox.top - assistantContentBox.bottom,
      assistantCopyLeft: assistantCopyBox.left,
      assistantContentLeft: assistantContentBox.left,
      assistantTextAlign: getComputedStyle(assistantCopy).textAlign,
    };
  });
  expect(geometry.userCopyTop).toBeGreaterThanOrEqual(geometry.bubbleBottom);
  expect(
    Math.abs(geometry.userCopyRight - geometry.bubbleRight),
  ).toBeLessThanOrEqual(2);
  expect(geometry.bubbleWidth).toBeLessThan(100);
  expect(geometry.assistantGap).toBeGreaterThanOrEqual(2);
  expect(geometry.assistantGap).toBeLessThanOrEqual(6);
  expect(
    Math.abs(geometry.assistantCopyLeft - geometry.assistantContentLeft),
  ).toBeLessThanOrEqual(2);
  expect(geometry.assistantTextAlign).toBe("left");

  await userCopy.click();
  await expect(userCopy).toHaveText("✓ Copied");
  await expect(assistantCopy).toHaveText("Copy");
  expect(
    await page.evaluate(() => window.workspaceHarness.clipboardText()),
  ).toBe("Hi");
  const copiedWidth = await userCopy.evaluate(
    (node) => node.getBoundingClientRect().width,
  );
  await expect(userCopy).toHaveText("Copy", { timeout: 3000 });
  expect(
    await userCopy.evaluate((node) => node.getBoundingClientRect().width),
  ).toBe(copiedWidth);

  await page.evaluate(() => window.workspaceHarness.failClipboard(true));
  await assistantCopy.click();
  await expect(assistantCopy).toHaveText("Copy failed");
  await expect(assistantCopy).not.toContainText("✓ Copied");
});

test("menus and dialogs close safely when their transient target disappears", async ({
  page,
}) => {
  await page.goto("/e2e/harness.html");
  const card = page.locator("assist-workspace-card");
  const history = card.locator("assist-workspace-history");
  const menu = card.locator("assist-workspace-conversation-menu");
  await history.locator(".chat-menu").first().click();
  await expect(menu.locator("[role=menu]")).toBeVisible();
  await page.mouse.click(900, 700);
  await expect(menu.locator("[role=menu]")).toBeHidden();

  await history.locator(".chat-menu").first().click();
  await page.evaluate(() => {
    const card = document.querySelector("assist-workspace-card");
    const menu = card.shadowRoot.querySelector(
      "assist-workspace-conversation-menu",
    );
    menu.anchor.remove();
    menu.requestUpdate();
  });
  await expect(menu.locator("[role=menu]")).toBeHidden();

  await history.locator(".chat-menu").first().click();
  await menu.getByRole("button", { name: "Rename" }).click();
  const dialogs = card.locator("assist-workspace-dialogs");
  await expect(dialogs.locator(".overlay")).toBeVisible();
  await dialogs.locator(".overlay").dispatchEvent("click");
  await expect(dialogs.locator(".overlay")).toBeHidden();
});

test("Axe baseline covers empty, inspector and dialog states", async ({
  page,
}) => {
  const scan = async () => {
    const results = await new AxeBuilder({ page })
      .include("assist-workspace-card")
      .analyze();
    expect(results.violations).toEqual([]);
  };

  await page.goto("/e2e/harness.html");
  await page
    .locator("assist-workspace-card assist-workspace-history .new-chat")
    .click();
  await scan();

  await page.goto("/e2e/harness.html");
  await page.evaluate(() => {
    const card = document.querySelector("assist-workspace-card");
    card.onTurnEvent(
      { id: "turn-a", conversationId: "a", terminal: false },
      {
        event: "tool_started",
        turn_id: "turn-a",
        conversation_id: "a",
        message_id: "tool-only",
        tool: {
          id: "nested-tool",
          name: "calendar.search",
          request: {
            name: "Kitchen",
            count: 7,
            enabled: true,
            missing: null,
          },
          response: { matches: ["next"] },
        },
      },
    );
  });
  const card = page.locator("assist-workspace-card");
  await card
    .locator(
      "assist-workspace-message-list assist-workspace-tool-summary .tool-summary",
    )
    .click();
  await card
    .locator(
      "assist-workspace-message-list assist-workspace-tool-summary .tool-row",
    )
    .click();
  const inspector = card.locator("assist-workspace-tool-inspector");
  await expect(inspector.locator("json-viewer")).toBeVisible();
  const semanticColors = await inspector
    .locator("json-viewer")
    .evaluate((viewer) => {
      const root = viewer.shadowRoot;
      const color = (selector) =>
        getComputedStyle(root.querySelector(selector)).color;
      return {
        key: color(".key"),
        string: color(".string"),
        number: color(".number"),
        boolean: color(".boolean"),
        null: color(".null"),
      };
    });
  expect(semanticColors).toEqual({
    key: "rgb(2, 124, 155)",
    string: "rgb(46, 125, 50)",
    number: "rgb(178, 106, 0)",
    boolean: "rgb(124, 77, 255)",
    null: "rgb(107, 114, 128)",
  });
  const jsonCopy = inspector.locator(".json-header button");
  const jsonCopyStyle = await jsonCopy.evaluate((button) => {
    const style = getComputedStyle(button);
    return {
      backgroundColor: style.backgroundColor,
      height: button.getBoundingClientRect().height,
    };
  });
  expect(jsonCopyStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(jsonCopyStyle.height).toBeLessThanOrEqual(28);
  await jsonCopy.click();
  await expect(jsonCopy).toHaveText("✓ Copied");
  expect(
    await page.evaluate(() => window.workspaceHarness.clipboardText()),
  ).toBe(
    '{\n  "name": "Kitchen",\n  "count": 7,\n  "enabled": true,\n  "missing": null\n}',
  );
  await expect(jsonCopy).toHaveText("Copy", { timeout: 3000 });
  await page.evaluate(() => window.workspaceHarness.failClipboard(true));
  await jsonCopy.click();
  await expect(jsonCopy).toHaveText("Copy failed");
  await page.evaluate(() => window.workspaceHarness.failClipboard(false));
  await inspector.getByRole("button", { name: "Response" }).click();
  await expect(inspector.locator("json-viewer")).toContainText("matches");
  await scan();

  await page.goto("/e2e/harness.html");
  const history = page.locator("assist-workspace-history");
  await history.locator(".chat-menu").first().click();
  await page
    .locator("assist-workspace-conversation-menu")
    .getByRole("button", { name: "Rename" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Rename conversation" }),
  ).toBeFocused();
  await scan();
});
