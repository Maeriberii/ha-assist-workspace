export const NEAR_BOTTOM_THRESHOLD = 96;

export type FollowState = {
  detachedFromBottom: boolean;
  hasUnread: boolean;
};

export const FOLLOWING: FollowState = {
  detachedFromBottom: false,
  hasUnread: false,
};

export const DETACHED: FollowState = {
  detachedFromBottom: true,
  hasUnread: false,
};

export function isNearBottom(
  target: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">,
) {
  return (
    target.scrollHeight - target.scrollTop - target.clientHeight <=
    NEAR_BOTTOM_THRESHOLD
  );
}

export function detachForUpwardIntent(state: FollowState): FollowState {
  return state.detachedFromBottom
    ? state
    : { detachedFromBottom: true, hasUnread: state.hasUnread };
}

export function followForScroll(
  target: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">,
  state: FollowState,
): FollowState {
  return isNearBottom(target)
    ? FOLLOWING
    : state.detachedFromBottom
      ? state
      : DETACHED;
}

export function showUnreadForNewContent(state: FollowState): FollowState {
  return !state.detachedFromBottom || state.hasUnread
    ? state
    : { ...state, hasUnread: true };
}
