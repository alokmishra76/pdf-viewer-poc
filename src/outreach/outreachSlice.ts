/**
 * Redux state of the outreach page:
 *
 *   projectRef, groupBy - which project, grouped how
 *   data                - the grouped outreach from the server
 *   openGroups          - which group sections are expanded (the first one by default)
 *   tables              - one table state per group (page, sort, filters, selection)
 *   columns             - column order / hidden columns, shared by every group's table
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { OutreachGroupBy, ProjectOutreachResponse } from '../api/outreach';
import { logout, sessionEnded } from '../auth/authSlice';
import { createInitialTableState } from '../components/dataTable/tableUtils';
import type { TableState } from '../components/dataTable/types';
import { buildOutreachTableConfig } from './outreachTableConfig';
import { fetchOutreach } from './outreachThunks';

type ColumnSettings = Pick<TableState, 'columnOrder' | 'hiddenColumns'>;

export interface OutreachState {
  projectRef: string | null;
  groupBy: OutreachGroupBy;
  data: ProjectOutreachResponse | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  /** Error code, e.g. NOT_FOUND for an unknown project */
  errorCode: string | null;
  requestId: string | null;
  openGroups: string[];
  tables: Record<string, TableState>;
  columns: ColumnSettings;
}

const blankTable = createInitialTableState(buildOutreachTableConfig([], [], 'template'));

const initialState: OutreachState = {
  projectRef: null,
  groupBy: 'status',
  data: null,
  status: 'idle',
  error: null,
  errorCode: null,
  requestId: null,
  openGroups: [],
  tables: {},
  columns: { columnOrder: blankTable.columnOrder, hiddenColumns: blankTable.hiddenColumns },
};

/** A fresh table for a group, using the shared column settings. */
export const newTable = (columns: ColumnSettings): TableState => ({ ...blankTable, ...columns });

const outreachSlice = createSlice({
  name: 'outreach',
  initialState,
  reducers: {
    /** The page opened for a project. A different project starts from a clean state. */
    outreachPageOpened(state, action: PayloadAction<string>) {
      if (state.projectRef?.toLowerCase() === action.payload.toLowerCase()) return;
      return { ...initialState, columns: state.columns, projectRef: action.payload };
    },
    groupByChanged(state, action: PayloadAction<OutreachGroupBy>) {
      if (state.groupBy === action.payload) return;
      state.groupBy = action.payload;
      // New groups: their tables start fresh and the first one opens again
      state.tables = {};
      state.openGroups = [];
    },
    groupToggled(state, action: PayloadAction<string>) {
      const key = action.payload;
      state.openGroups = state.openGroups.includes(key) ? state.openGroups.filter((k) => k !== key) : [...state.openGroups, key];
    },
    allGroupsToggled(state, action: PayloadAction<boolean>) {
      state.openGroups = action.payload ? (state.data?.groups.map((g) => g.key) ?? []) : [];
    },
    /** A group's DataTable changed something. Column settings apply to every group. */
    groupTableChanged(state, action: PayloadAction<{ groupKey: string; changes: Partial<TableState> }>) {
      const { groupKey, changes } = action.payload;
      const { columnOrder, hiddenColumns, ...own } = changes;

      if (columnOrder || hiddenColumns) {
        if (columnOrder) state.columns.columnOrder = columnOrder;
        if (hiddenColumns) state.columns.hiddenColumns = hiddenColumns;
        for (const table of Object.values(state.tables)) Object.assign(table, state.columns);
      }
      state.tables[groupKey] ??= newTable(state.columns);
      Object.assign(state.tables[groupKey], own);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOutreach.pending, (state, action) => {
        state.status = 'loading';
        state.error = null;
        state.errorCode = null;
        state.requestId = action.meta.requestId;
      })
      .addCase(fetchOutreach.fulfilled, (state, action) => {
        if (state.requestId !== action.meta.requestId) return;
        state.status = 'succeeded';
        state.data = action.payload;

        for (const group of action.payload.groups) {
          const table = (state.tables[group.key] ??= newTable(state.columns));
          // After a reload, forget selected rows that moved to another group
          const ids = new Set(group.items.map((i) => i.id));
          table.selectedIds = table.selectedIds.filter((id) => ids.has(Number(id)));
        }
        // First load (or new grouping): open the first group
        if (state.openGroups.length === 0 && action.payload.groups.length > 0) {
          state.openGroups = [action.payload.groups[0].key];
        }
      })
      .addCase(fetchOutreach.rejected, (state, action) => {
        if (state.requestId !== action.meta.requestId || action.meta.aborted) return;
        state.status = 'failed';
        state.error = action.payload?.message ?? 'Could not load outreach.';
        state.errorCode = action.payload?.code ?? null;
      })
      .addCase(sessionEnded, () => initialState)
      .addCase(logout.fulfilled, () => initialState);
  },
});

export const { outreachPageOpened, groupByChanged, groupToggled, allGroupsToggled, groupTableChanged } = outreachSlice.actions;
export const outreachReducer = outreachSlice.reducer;

type StateWithOutreach = { outreach: OutreachState };
export const selectOutreach = (state: StateWithOutreach) => state.outreach;
export const selectOutreachTable = (state: StateWithOutreach, groupKey: string) => state.outreach.tables[groupKey];
