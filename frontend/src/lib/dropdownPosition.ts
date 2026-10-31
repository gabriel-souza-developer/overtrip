export interface DropdownAnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface Viewport {
  width: number;
  height: number;
}

const EDGE_PADDING = 8;
const GAP = 4;

/**
 * Positions a fixed-position dropdown menu relative to the button that opened
 * it, clamped so it never renders off-screen, flipping above the button when
 * there isn't enough room below.
 */
export function computeDropdownPosition(
  buttonRect: DropdownAnchorRect,
  viewport: Viewport,
  menuWidth: number,
  menuHeight: number
): { top: number; left: number } {
  const fitsBelow = buttonRect.bottom + GAP + menuHeight + EDGE_PADDING <= viewport.height;
  const top = fitsBelow ? buttonRect.bottom + GAP : buttonRect.top - GAP - menuHeight;

  const maxTop = viewport.height - menuHeight - EDGE_PADDING;
  const clampedTop = Math.min(Math.max(top, EDGE_PADDING), Math.max(maxTop, EDGE_PADDING));

  const left = buttonRect.right - menuWidth;
  const maxLeft = viewport.width - menuWidth - EDGE_PADDING;
  const clampedLeft = Math.min(Math.max(left, EDGE_PADDING), Math.max(maxLeft, EDGE_PADDING));

  return { top: clampedTop, left: clampedLeft };
}
