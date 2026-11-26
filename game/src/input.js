// Keyboard and pointer input. Held keys give a throttle direction and a pitch
// command; one-shot presses (start, pause, drop the crate) are queued as bit
// flags and taken once by the loop, so a press between two frames is never
// lost and never counted twice.
//
// Side-view mapping, so the keys match the screen: Up/W pulls the nose up,
// Down/S pushes it down, Right/D opens the throttle, Left/A closes it. The
// mouse steers too — hold the pointer above the plane to climb, below to
// descend — and a click drops the crate (or confirms on a panel).

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_DROP = 4;

const PITCH_UP = new Set(['ArrowUp', 'KeyW']);
const PITCH_DOWN = new Set(['ArrowDown', 'KeyS']);
const THROTTLE_UP = new Set(['ArrowRight', 'KeyD']);
const THROTTLE_DOWN = new Set(['ArrowLeft', 'KeyA']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const DROP = new Set(['Space']);

export function createInput(target) {
  let pitchUp = false;
  let pitchDown = false;
  let throttleUp = false;
  let throttleDown = false;
  let actions = 0;
  let pointerY = null; // pointer height over the canvas, or null when away
  let pointerSeen = 0; // last time (ms) the pointer moved

  function mark(event, set) {
    if (PITCH_UP.has(event.code)) pitchUp = set;
    else if (PITCH_DOWN.has(event.code)) pitchDown = set;
    else if (THROTTLE_UP.has(event.code)) throttleUp = set;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = set;
    else return false;
    return true;
  }

  window.addEventListener('keydown', (event) => {
    if (mark(event, true)) {
      event.preventDefault();
      return;
    }
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
      event.preventDefault();
    } else if (DROP.has(event.code)) {
      if (!event.repeat) actions |= ACTION_DROP;
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    mark(event, false);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything.
  window.addEventListener('blur', () => {
    pitchUp = false;
    pitchDown = false;
    throttleUp = false;
    throttleDown = false;
  });

  target.addEventListener('pointermove', (event) => {
    const rect = target.getBoundingClientRect();
    pointerY = event.clientY - rect.top;
    pointerSeen = performance.now();
  });
  target.addEventListener('pointerleave', () => {
    pointerY = null;
  });
  target.addEventListener('pointerdown', (event) => {
    const rect = target.getBoundingClientRect();
    pointerY = event.clientY - rect.top;
    pointerSeen = performance.now();
    actions |= ACTION_DROP;
  });

  return {
    /** -1 to close the throttle, 1 to open it, 0 to hold. */
    throttleDelta() {
      return (throttleUp ? 1 : 0) - (throttleDown ? 1 : 0);
    },
    /**
     * -1 to dive, 1 to climb, 0 to hold the nose. Keys win over the mouse;
     * the mouse only steers when no pitch key is held and it moved recently.
     */
    pitchCommand(canvasHeight) {
      if (pitchUp) return 1;
      if (pitchDown) return -1;
      if (pointerY !== null && performance.now() - pointerSeen < 2500) {
        const centre = canvasHeight / 2;
        const offset = (centre - pointerY) / centre; // +1 at the top edge
        if (offset > 0.18) return 1;
        if (offset < -0.18) return -1;
      }
      return 0;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
