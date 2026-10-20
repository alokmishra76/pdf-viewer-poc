import { useId } from 'react';
import type { OutreachGroup } from '../api/outreach';
import { DataTable } from '../components/dataTable';
import { useOutreachGroupTable } from './useOutreachGroupTable';

interface OutreachGroupSectionProps {
  group: OutreachGroup;
  open: boolean;
  onToggle: () => void;
}

/** One collapsible group: a header with its name and count, and its own full-featured table. */
export function OutreachGroupSection({ group, open, onToggle }: OutreachGroupSectionProps) {
  const panelId = useId();

  return (
    <section className={`outreach-group${open ? ' outreach-group--open' : ''}`}>
      <h3 className="outreach-group__heading">
        <button type="button" className="outreach-group__toggle" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
          <span className="outreach-group__chevron" aria-hidden="true" />
          <span className="outreach-group__label">{group.label}</span>
          <span className="outreach-group__count">{group.count}</span>
        </button>
      </h3>
      {/* Closed groups don't render their table, so a long list stays fast */}
      {open && (
        <div id={panelId} className="outreach-group__body">
          <GroupTable group={group} />
        </div>
      )}
    </section>
  );
}

function GroupTable({ group }: { group: OutreachGroup }) {
  const table = useOutreachGroupTable(group);
  return <DataTable {...table} />;
}
