import { useRef } from 'react';

interface PanelSplitterProps {
  /** Called with the pointer movement in px since the last event. */
  onResize: (deltaX: number) => void;
  label: string;
  disabled?: boolean;
}

const KEYBOARD_STEP = 24;

/** A draggable divider between two panels. */
export default function PanelSplitter({ onResize, label, disabled }: PanelSplitterProps) {
  const lastX = useRef(0);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    event.preventDefault();
    lastX.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
    // Column transitions would lag a drag, and the cursor should not flicker
    // as it passes over the panels either side.
    document.body.classList.add('is-resizing');
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const deltaX = event.clientX - lastX.current;
    if (!deltaX) return;
    lastX.current = event.clientX;
    onResize(deltaX);
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    document.body.classList.remove('is-resizing');
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    onResize(event.key === 'ArrowLeft' ? -KEYBOARD_STEP : KEYBOARD_STEP);
  }

  return (
    <div
      className="panel-splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
    >
      <span className="panel-splitter-grip" aria-hidden="true" />
    </div>
  );
}
