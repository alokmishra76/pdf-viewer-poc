import type { CellEditorConfig } from './types';

interface CellEditorProps {
  editor: CellEditorConfig;
  value: unknown;
  label: string;
  onChange: (value: unknown) => void;
  autoFocus?: boolean;
}

/** The input shown in a cell while its row is being edited (also used by bulk update). */
export function CellEditor({ editor, value, label, onChange, autoFocus }: CellEditorProps) {
  const text = value === null || value === undefined ? '' : String(value);

  switch (editor.type) {
    case 'select':
      return (
        <select className="dt-input" aria-label={label} autoFocus={autoFocus} value={text} onChange={(e) => onChange(e.target.value)}>
          {!editor.options.some((o) => o.value === text) && <option value="">Choose…</option>}
          {editor.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    case 'number':
      return (
        <input
          className="dt-input"
          type="number"
          aria-label={label}
          autoFocus={autoFocus}
          min={editor.min}
          max={editor.max}
          value={text}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      );
    case 'date':
      return (
        <input
          className="dt-input"
          type="date"
          aria-label={label}
          autoFocus={autoFocus}
          // Accepts "2026-11-03" or a full date-time; the input only shows the day
          value={text.slice(0, 10)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    default:
      return (
        <input
          className="dt-input"
          aria-label={label}
          autoFocus={autoFocus}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
