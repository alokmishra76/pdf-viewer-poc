import { useEffect, useRef, useState } from 'react';
import { Button } from '../../widget';
import { isFilterEmpty } from './tableUtils';
import type { ColumnFilterConfig, FilterValue, TableColumn } from './types';

interface ColumnFilterProps<Row> {
  column: TableColumn<Row> & { filter: ColumnFilterConfig };
  value: FilterValue | undefined;
  onApply: (value: FilterValue | undefined) => void;
}

function emptyValue(config: ColumnFilterConfig): FilterValue {
  switch (config.type) {
    case 'text':
      return { type: 'text', value: '' };
    case 'select':
      return { type: 'select', values: [] };
    case 'numberRange':
      return { type: 'numberRange' };
    case 'dateRange':
      return { type: 'dateRange' };
  }
}

const toNumber = (text: string) => (text === '' ? undefined : Number(text));

/** The funnel button in a column header and its small popup. Changes apply when the user clicks Apply. */
export function ColumnFilter<Row>({ column, value, onApply }: ColumnFilterProps<Row>) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterValue>(value ?? emptyValue(column.filter));
  const rootRef = useRef<HTMLDivElement>(null);
  const active = !isFilterEmpty(value);

  // Close on click outside or Escape
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const apply = (next: FilterValue | undefined) => {
    onApply(next && !isFilterEmpty(next) ? next : undefined);
    setOpen(false);
  };

  return (
    <div className="dt-filter" ref={rootRef}>
      <button
        type="button"
        className={`dt-filter__button${active ? ' dt-filter__button--active' : ''}`}
        onClick={() => {
          // Start from the current filter each time the popup opens
          if (!open) setDraft(value ?? emptyValue(column.filter));
          setOpen(!open);
        }}
        aria-expanded={open}
        aria-label={`Filter ${column.header}${active ? ' (active)' : ''}`}
      >
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M1.5 2h13l-5 6.2V14l-3-1.5V8.2z" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <form
          className="dt-filter__popup"
          onSubmit={(e) => {
            e.preventDefault();
            apply(draft);
          }}
        >
          <p className="dt-filter__title">Filter by {column.header}</p>
          <FilterControl config={column.filter} draft={draft} onChange={setDraft} />
          <div className="dt-filter__actions">
            <Button variant="secondary" size="sm" onClick={() => apply(undefined)}>
              Clear
            </Button>
            <Button type="submit" size="sm">
              Apply
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function FilterControl({
  config,
  draft,
  onChange,
}: {
  config: ColumnFilterConfig;
  draft: FilterValue;
  onChange: (value: FilterValue) => void;
}) {
  if (config.type === 'text' && draft.type === 'text') {
    return (
      <input
        className="dt-input"
        autoFocus
        placeholder={config.placeholder ?? 'Contains…'}
        value={draft.value}
        onChange={(e) => onChange({ type: 'text', value: e.target.value })}
      />
    );
  }

  if (config.type === 'select' && draft.type === 'select') {
    const multiple = config.multiple !== false;
    const toggle = (optionValue: string) => {
      const has = draft.values.includes(optionValue);
      const values = multiple
        ? has
          ? draft.values.filter((v) => v !== optionValue)
          : [...draft.values, optionValue]
        : has
          ? []
          : [optionValue];
      onChange({ type: 'select', values });
    };
    return (
      <div className="dt-filter__options">
        {config.options.map((option) => (
          <label key={option.value} className="dt-filter__option">
            <input
              type={multiple ? 'checkbox' : 'radio'}
              checked={draft.values.includes(option.value)}
              onChange={() => toggle(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    );
  }

  if (config.type === 'numberRange' && draft.type === 'numberRange') {
    return (
      <div className="dt-filter__range">
        <input
          className="dt-input"
          type="number"
          aria-label="Minimum"
          placeholder="Min"
          min={config.min}
          max={config.max}
          value={draft.min ?? ''}
          onChange={(e) => onChange({ ...draft, min: toNumber(e.target.value) })}
        />
        <span aria-hidden="true">–</span>
        <input
          className="dt-input"
          type="number"
          aria-label="Maximum"
          placeholder="Max"
          min={config.min}
          max={config.max}
          value={draft.max ?? ''}
          onChange={(e) => onChange({ ...draft, max: toNumber(e.target.value) })}
        />
      </div>
    );
  }

  if (config.type === 'dateRange' && draft.type === 'dateRange') {
    return (
      <div className="dt-filter__range">
        <input
          className="dt-input"
          type="date"
          aria-label="From"
          value={draft.from ?? ''}
          onChange={(e) => onChange({ ...draft, from: e.target.value || undefined })}
        />
        <span aria-hidden="true">–</span>
        <input
          className="dt-input"
          type="date"
          aria-label="To"
          value={draft.to ?? ''}
          onChange={(e) => onChange({ ...draft, to: e.target.value || undefined })}
        />
      </div>
    );
  }

  return null;
}
