import type { Direction } from './map-types';

export const touchInput: Record<Direction, boolean> = {
  up: false,
  down: false,
  left: false,
  right: false,
};

export function bindTouchControls(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-direction]').forEach((button) => {
    const direction = button.dataset.direction as Direction;
    const setPressed = (pressed: boolean) => {
      touchInput[direction] = pressed;
      button.classList.toggle('pressed', pressed);
    };

    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      setPressed(true);
    });
    button.addEventListener('pointerup', () => setPressed(false));
    button.addEventListener('pointercancel', () => setPressed(false));
    button.addEventListener('lostpointercapture', () => setPressed(false));
  });
}
