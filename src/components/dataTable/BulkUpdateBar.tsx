import { useState } from 'react';
import { Button } from '../../widget';
import { CellEditor } from './CellEditor';
import { fieldOf } from './tableUtils';
import type { CellEditorConfig, RowChanges, TableColumn } from './types';

interface BulkUpdateBarProps<Row> {
  selectedCount: number;
  /** Columns that are bulkEditable and have an editor */
  columns: Array<TableColumn<Row> & { editor: CellEditorConfig }>;
  canUpdate: boolean;
  onApply: (changes: RowChanges) => Promise<void>;
  onClearSelection: () => void;
}

/** Shown while rows are selected: "3 selected · Set [field] to [value] · Apply". */
export function BulkUpdateBar<Row>({ selectedCount, columns, canUpdate, onApply, onClearSelection }: BulkUpdateBarProps<Row>) {
  const [columnId, setColumnId] = useState(columns[0]?.id ?? '');
  const [value, setValue] = useState<unknown>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const column = columns.find((c) => c.id === columnId);
  const hasValue = value !== '' && value !== null && value !== undefined;

  const apply = async () => {
    if (!column || !hasValue) return;
    setSaving(true);
    setError(null);
    try {
      await onApply({ [fieldOf(column)]: value });
      setValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the selected rows.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dt-bulk" role="region" aria-label="Bulk update">
      <strong className="dt-bulk__count">{selectedCount} selected</strong>

      {canUpdate && column && (
        <>
          <span className="dt-bulk__label">Set</span>
          <select
            className="dt-input dt-bulk__field"
            aria-label="Field to update"
            value={columnId}
            onChange={(e) => {
              setColumnId(e.target.value);
              setValue('');
            }}
          >
            {columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.header}
              </option>
            ))}
          </select>
          <span className="dt-bulk__label">to</span>
          <span className="dt-bulk__value">
            <CellEditor key={column.id} editor={column.editor} value={value} label={`New ${column.header}`} onChange={setValue} />
          </span>
          <Button size="sm" onClick={apply} loading={saving} disabled={!hasValue}>
            Apply to {selectedCount}
          </Button>
        </>
      )}

      <Button variant="link" size="sm" onClick={onClearSelection}>
        Clear selection
      </Button>
      {error && (
        <span className="dt-bulk__error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
