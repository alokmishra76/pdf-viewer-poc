import { useState } from 'react';
import { Button } from '../../widget';
import { moveColumn, orderedColumns } from './tableUtils';
import type { TableColumn } from './types';

interface ColumnConfigPanelProps<Row> {
  id: string;
  columns: TableColumn<Row>[];
  columnOrder: string[];
  hiddenColumns: string[];
  onChange: (changes: { columnOrder?: string[]; hiddenColumns?: string[] }) => void;
  onReset: () => void;
}

/**
 * The collapsible "Columns" panel: tick to show / hide a column, drag a row
 * (or use ↑ ↓) to change the order. Uses the browser's built-in drag and drop.
 */
export function ColumnConfigPanel<Row>({ id, columns, columnOrder, hiddenColumns, onChange, onReset }: ColumnConfigPanelProps<Row>) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const ordered = orderedColumns(columns, columnOrder);
  const order = ordered.map((c) => c.id);
  const visibleCount = ordered.filter((c) => !hiddenColumns.includes(c.id)).length;

  const toggle = (columnId: string) => {
    const hidden = hiddenColumns.includes(columnId);
    onChange({ hiddenColumns: hidden ? hiddenColumns.filter((c) => c !== columnId) : [...hiddenColumns, columnId] });
  };

  const move = (columnId: string, offset: -1 | 1) => {
    const target = order[order.indexOf(columnId) + offset];
    if (target) onChange({ columnOrder: moveColumn(order, columnId, target) });
  };

  const endDrag = () => {
    setDraggingId(null);
    setOverId(null);
  };

  return (
    <div id={id} className="dt-columns" role="region" aria-label="Column settings">
      <div className="dt-columns__header">
        <span>Show, hide and drag to reorder</span>
        <Button variant="link" size="sm" onClick={onReset}>
          Reset
        </Button>
      </div>

      <ul className="dt-columns__list">
        {ordered.map((column, index) => {
          const hidden = hiddenColumns.includes(column.id);
          const canHide = column.hideable !== false;
          // Never let the user hide the last visible column
          const isLastVisible = !hidden && visibleCount === 1;

          return (
            <li
              key={column.id}
              className={[
                'dt-columns__item',
                draggingId === column.id && 'dt-columns__item--dragging',
                overId === column.id && draggingId !== column.id && 'dt-columns__item--over',
              ]
                .filter(Boolean)
                .join(' ')}
              draggable
              onDragStart={(e) => {
                setDraggingId(column.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', column.id);
              }}
              onDragOver={(e) => {
                e.preventDefault(); // allows dropping here
                if (overId !== column.id) setOverId(column.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const dragged = e.dataTransfer.getData('text/plain') || draggingId;
                if (dragged) onChange({ columnOrder: moveColumn(order, dragged, column.id) });
                endDrag();
              }}
              onDragEnd={endDrag}
            >
              <span className="dt-columns__handle" aria-hidden="true">
                ⋮⋮
              </span>
              <label className="dt-columns__label">
                <input
                  type="checkbox"
                  checked={!hidden}
                  disabled={!canHide || isLastVisible}
                  onChange={() => toggle(column.id)}
                />
                {column.header}
              </label>
              <span className="dt-columns__move">
                <button type="button" onClick={() => move(column.id, -1)} disabled={index === 0} aria-label={`Move ${column.header} up`}>
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(column.id, 1)}
                  disabled={index === ordered.length - 1}
                  aria-label={`Move ${column.header} down`}
                >
                  ↓
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
