import { describe, expect, test } from "vitest";
import {
  DETACHED,
  FOLLOWING,
  detachForUpwardIntent,
  followForScroll,
  showUnreadForNewContent,
} from "../src/utils/scroll-follow.js";

const position = (scrollTop: number) => ({
  scrollHeight: 1000,
  scrollTop,
  clientHeight: 400,
});

describe("scroll follow state", () => {
  test("detaches immediately on upward intent and keeps new content unread", () => {
    expect(detachForUpwardIntent(FOLLOWING)).toEqual(DETACHED);
    expect(showUnreadForNewContent(DETACHED)).toEqual({
      detachedFromBottom: true,
      hasUnread: true,
    });
  });

  test("returns to following when the user reaches the bottom", () => {
    expect(followForScroll(position(500), DETACHED)).toEqual(DETACHED);
    expect(followForScroll(position(504), DETACHED)).toEqual(FOLLOWING);
    expect(
      followForScroll(position(504), {
        detachedFromBottom: true,
        hasUnread: true,
      }),
    ).toEqual(FOLLOWING);
  });

  test("does not invent unread content when the user detaches", () => {
    expect(detachForUpwardIntent(FOLLOWING).hasUnread).toBe(false);
    expect(showUnreadForNewContent(FOLLOWING)).toBe(FOLLOWING);
  });
});
