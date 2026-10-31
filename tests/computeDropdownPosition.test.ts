import { describe, it, expect } from 'vitest';
import { computeDropdownPosition } from '../frontend/src/lib/dropdownPosition';

const viewport = { width: 1280, height: 800 };
const menuWidth = 192;
const menuHeight = 100;

describe('computeDropdownPosition', () => {
  it('opens below and right-aligned to the button when there is room', () => {
    const buttonRect = { top: 200, bottom: 232, left: 600, right: 632 };
    const position = computeDropdownPosition(buttonRect, viewport, menuWidth, menuHeight);
    expect(position.top).toBe(236); // bottom + gap(4)
    expect(position.left).toBe(440); // right(632) - menuWidth(192)
  });

  it('clamps left so the menu never overflows the right edge of the viewport', () => {
    const buttonRect = { top: 200, bottom: 232, left: 1270, right: 1278 };
    const position = computeDropdownPosition(buttonRect, viewport, menuWidth, menuHeight);
    expect(position.left).toBe(viewport.width - menuWidth - 8);
  });

  it('clamps left so the menu never overflows the left edge of the viewport', () => {
    const buttonRect = { top: 200, bottom: 232, left: 2, right: 10 };
    const position = computeDropdownPosition(buttonRect, viewport, menuWidth, menuHeight);
    expect(position.left).toBe(8);
  });

  it('flips the menu above the button when there is not enough room below', () => {
    const buttonRect = { top: 740, bottom: 772, left: 600, right: 632 };
    const position = computeDropdownPosition(buttonRect, viewport, menuWidth, menuHeight);
    expect(position.top).toBe(buttonRect.top - 4 - menuHeight);
    expect(position.top).toBeLessThan(buttonRect.top);
  });
});

describe('computeDropdownPosition com margem da borda', () => {
  it('abre para cima quando abaixo sobraria menos que a margem de borda', () => {
    // bottom(690) + gap(4) + menu(100) = 794 cabe em 800, mas sem a margem de 8 px encosta na borda.
    const buttonRect = { top: 658, bottom: 690, left: 600, right: 632 };
    const position = computeDropdownPosition(buttonRect, viewport, menuWidth, menuHeight);
    expect(position.top).toBe(buttonRect.top - 4 - menuHeight);
  });

  it('continua abrindo para baixo quando sobra espaço com a margem de borda', () => {
    // bottom(680) + gap(4) + menu(100) + padding(8) = 792 <= 800
    const buttonRect = { top: 648, bottom: 680, left: 600, right: 632 };
    const position = computeDropdownPosition(buttonRect, viewport, menuWidth, menuHeight);
    expect(position.top).toBe(684);
  });
});
