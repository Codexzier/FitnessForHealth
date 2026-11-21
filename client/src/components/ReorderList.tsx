import { useState, type ReactNode } from 'react';

export interface ReorderControls {
  handle: ReactNode;
  arrows: ReactNode;
}

/**
 * Liste mit Drag & Drop (Maus, über den Griff ⋮⋮) und Pfeil-Buttons (Touch & Tastatur).
 */
export function ReorderList<T>({
  items,
  keyOf,
  onMove,
  render,
}: {
  items: T[];
  keyOf: (item: T, index: number) => string | number;
  onMove: (from: number, to: number) => void;
  render: (item: T, index: number, controls: ReorderControls) => ReactNode;
}) {
  const [armed, setArmed] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  return (
    <div className="list">
      {items.map((item, i) => {
        const controls: ReorderControls = {
          handle: (
            <span
              className="drag-handle desktop-only"
              title="Ziehen zum Verschieben"
              onMouseDown={() => setArmed(i)}
              onMouseUp={() => setArmed(null)}
            >
              ⋮⋮
            </span>
          ),
          arrows: (
            <span className="order-buttons">
              <button
                type="button"
                className="icon small"
                aria-label="Nach oben"
                disabled={i === 0}
                onClick={() => onMove(i, i - 1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="icon small"
                aria-label="Nach unten"
                disabled={i === items.length - 1}
                onClick={() => onMove(i, i + 1)}
              >
                ↓
              </button>
            </span>
          ),
        };
        return (
          <div
            key={keyOf(item, i)}
            draggable={armed === i}
            className={dragging === i ? 'dragging' : over === i && dragging !== null ? 'drop-target-wrap' : undefined}
            onDragStart={(e) => {
              setDragging(i);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', String(i));
            }}
            onDragOver={(e) => {
              if (dragging === null) return;
              e.preventDefault();
              setOver(i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragging !== null && dragging !== i) onMove(dragging, i);
              setDragging(null);
              setOver(null);
              setArmed(null);
            }}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
              setArmed(null);
            }}
            style={over === i && dragging !== null && dragging !== i ? { outline: '2px dashed var(--accent)', borderRadius: 12 } : undefined}
          >
            {render(item, i, controls)}
          </div>
        );
      })}
    </div>
  );
}

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [it] = copy.splice(from, 1);
  copy.splice(to, 0, it);
  return copy;
}
