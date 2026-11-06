/** BUILD panel gesture. A finger that starts here never pans the field or dismisses the list. */

export const BUILD_DRAG_PX = 10;

export type BuildListState = {
  open: boolean;
  scroll: number;
  placing: string | null;
};

export type BuildListEvent =
  | { t: "toggle" }
  | { t: "close" }
  | { t: "tap-field" }
  | { t: "drag"; dy: number }
  | { t: "complete" }
  | { t: "clock" }
  | { t: "tap-card"; id: string; blocked: boolean };

/** Only a card tap, BUILD again, or a battlefield tap closes the list. Toasts and the clock do not. */
export function reduceBuildList(state: BuildListState, event: BuildListEvent): BuildListState {
  switch (event.t) {
    case "toggle":
      return { ...state, open: !state.open };
    case "close":
    case "tap-field":
      return { ...state, open: false };
    case "drag":
      if (!state.open) return state;
      return { ...state, scroll: Math.max(0, state.scroll - event.dy), placing: null };
    case "complete":
    case "clock":
      return state;
    case "tap-card":
      if (!state.open || event.blocked) return state;
      return { open: false, scroll: state.scroll, placing: event.id };
    default:
      return state;
  }
}

/** True once the finger has moved far enough that the gesture is a scroll, not a card tap. */
export function gestureMoved(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= BUILD_DRAG_PX;
}

let savedScroll = 0;

export function rememberBuildScroll(n: number) {
  if (Number.isFinite(n)) savedScroll = Math.max(0, n);
}

export function savedBuildScroll() {
  return savedScroll;
}

let owning = false;

/** True while a finger that started in the BUILD panel is still down. */
export function setBuildPanelOwning(on: boolean) {
  owning = on;
}

export function buildPanelOwning() {
  return owning;
}

let swallowUntil = 0;

/** The click that follows a handled pointerup must not place or close a second time. */
export function swallowBuildClick() {
  swallowUntil = Date.now() + 700;
}

export function buildClickSwallowed() {
  return Date.now() < swallowUntil;
}
