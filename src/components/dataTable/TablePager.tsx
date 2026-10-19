import { Button } from '../../widget';
import type { TablePagination } from './types';

interface TablePagerProps {
  page: number;
  pageSize: number;
  pageSizeOptions: number[];
  pagination: TablePagination;
  disabled?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

/** Footer: rows per page, "Showing 11–20 of 137", and Previous / Next (disabled using hasPrevious / hasNext). */
export function TablePager({ page, pageSize, pageSizeOptions, pagination, disabled, onPageChange, onPageSizeChange }: TablePagerProps) {
  const from = pagination.from ?? (pagination.totalItems === 0 ? 0 : (page - 1) * pageSize + 1);
  const to = pagination.to ?? Math.min(page * pageSize, pagination.totalItems);

  return (
    <div className="dt-pager">
      <label className="dt-pager__size">
        Rows per page
        <select className="dt-input" value={pageSize} disabled={disabled} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>

      <span className="dt-pager__summary" aria-live="polite">
        {pagination.totalItems === 0 ? 'No results' : `Showing ${from}–${to} of ${pagination.totalItems.toLocaleString()}`}
      </span>

      <div className="dt-pager__nav">
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || !pagination.hasPrevious}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          ‹ Previous
        </Button>
        <span className="dt-pager__page">
          Page {Math.min(page, Math.max(pagination.totalPages, 1))} of {Math.max(pagination.totalPages, 1)}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || !pagination.hasNext}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          Next ›
        </Button>
      </div>
    </div>
  );
}
