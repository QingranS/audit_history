import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FluentProvider,
  webLightTheme,
  makeStyles,
  tokens,
  TabList,
  Tab,
  Input,
  Dropdown,
  Option,
  Field,
  Button,
  Checkbox,
  Badge,
  Spinner,
  Text,
  Card,
  CardHeader,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  TableCellLayout,
  Table,
  TableHeader,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  Toaster,
  Toast,
  ToastTitle,
  useId,
  useToastController,
  createTableColumn,
} from "@fluentui/react-components";
import type {
  TableColumnDefinition,
  BadgeProps,
  DataGridProps,
} from "@fluentui/react-components";
import type { AuditService } from "../components/service/auditServer";
import type { AuditQuery, AuditRecord, SortColumn, SortDirection } from "../components/audittypes";
import { ACTION_LABELS } from "../components/audittypes";

interface Props {
  service: AuditService;
  title?: string;
  pageSize?: number;
}

type View = "audit" | "bin";

function formatTime(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}
function eventBadgeColor(code: number): BadgeProps["color"] {
  if (code === 1) return "success";
  if (code === 2) return "informative";
  if (code === 3) return "danger";
  return "subtle";
}
function fieldsSummary(r: AuditRecord): string {
  const fields = (r.changes ?? []).map((c) => c.field);
  return fields.length ? fields.join(", ") : "—";
}
const startOfDay = (d: string) => (d ? `${d}T00:00:00Z` : undefined);
const endOfDay = (d: string) => (d ? `${d}T23:59:59Z` : undefined);

const useStyles = makeStyles({
  root: {
    width: "100%",
    maxWidth: "1280px",
    margin: "0 auto",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalL,
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalXL}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  title: { margin: 0, flex: "1 1 auto" },
  toolbar: {
    display: "flex",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalXL}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  search: { minWidth: "220px", flex: "1 1 220px" },
  spacer: { flex: "1 1 auto" },
  binNote: { color: tokens.colorNeutralForeground3, alignSelf: "center" },
  dangerBtn: {
    backgroundColor: tokens.colorStatusDangerBackground3,
    color: tokens.colorNeutralForegroundOnBrand,
    border: "none",
    ":hover": {
      backgroundColor: tokens.colorStatusDangerBackground3,
      color: tokens.colorNeutralForegroundOnBrand,
    },
    ":hover:active": {
      backgroundColor: tokens.colorStatusDangerBackground3,
      color: tokens.colorNeutralForegroundOnBrand,
    },
  },
  gridWrap: { position: "relative", overflowX: "auto" },
  row: { cursor: "pointer" },
  empty: {
    padding: tokens.spacingVerticalXXL,
    textAlign: "center",
    color: tokens.colorNeutralForeground3,
  },
  loading: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.colorNeutralBackgroundAlpha,
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalXL}`,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  pager: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalM },
  muted: { color: tokens.colorNeutralForeground3 },
  dialogSurface: { maxWidth: "960px" },
  detailCard: { marginBottom: tokens.spacingVerticalL },
  changesTable: { marginTop: tokens.spacingVerticalM },
  oldVal: { color: tokens.colorPaletteRedForeground1 },
  newVal: { color: tokens.colorPaletteGreenForeground1 },
});

export function AuditGrid({ service, title = "Audit history", pageSize = 25 }: Props) {
  const styles = useStyles();
  const toasterId = useId("audit-toaster");
  const { dispatchToast } = useToastController(toasterId);
  const notify = useCallback(
    (message: string) =>
      dispatchToast(<Toast><ToastTitle>{message}</ToastTitle></Toast>, {
        intent: "success",
        timeout: 4000,
      }),
    [dispatchToast],
  );

  const [view, setView] = useState<View>("audit");

  // filter / sort
  const [table, setTable] = useState("");
  const [debouncedTable, setDebouncedTable] = useState("");
  const [actionFilter, setActionFilter] = useState<number | "all">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortBy, setSortBy] = useState<SortColumn>("createdOn");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [q, setQ] = useState("");

  // audit paging
  const [rows, setRows] = useState<AuditRecord[]>([]);
  const [nextLink, setNextLink] = useState<string | undefined>(undefined);
  const [pageIndex, setPageIndex] = useState(0);
  const cursors = useRef<(string | undefined)[]>([undefined]);
  const reqId = useRef(0);

  // recycle bin
  const [binRows, setBinRows] = useState<AuditRecord[]>([]);

  // shared
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Map<string, AuditRecord>>(new Map());
  const [detail, setDetail] = useState<AuditRecord | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedTable(table.trim()), 300);
    return () => clearTimeout(t);
  }, [table]);

  const query = useMemo<AuditQuery>(
    () => ({
      objectTypeCode: debouncedTable || undefined,
      action: actionFilter,
      fromDate: startOfDay(fromDate),
      toDate: endOfDay(toDate),
      sortBy, sortDir, pageSize,
    }),
    [debouncedTable, actionFilter, fromDate, toDate, sortBy, sortDir, pageSize],
  );

  const fetchPage = useCallback(
    async (index: number) => {
      const id = ++reqId.current;
      setLoading(true);
      const page = index === 0 ? await service.list(query) : await service.listMore(cursors.current[index]!);
      if (id !== reqId.current) return;
      cursors.current[index + 1] = page.nextLink;
      setRows(page.rows);
      setNextLink(page.nextLink);
      setPageIndex(index);
      setLoading(false);
    },
    [service, query],
  );

  const reloadAudit = useCallback(() => {
    cursors.current = [undefined];
    return fetchPage(0);
  }, [fetchPage]);

  const loadBin = useCallback(async () => {
    const items = await service.listRecycleBin();
    setBinRows(items);
  }, [service]);

  // audit reloads on query change
  useEffect(() => { void reloadAudit(); }, [reloadAudit]);
  // keep the bin count fresh
  useEffect(() => { void loadBin(); }, [loadBin]);

  function switchView(v: View) {
    if (v === view) return;
    setView(v);
    setSelected(new Map());
    setDetail(null);
    if (v === "bin") void loadBin();
  }

  const displayRows = view === "audit" ? rows : binRows;

  const shown = q
    ? displayRows.filter((r) =>
        `${r.userName} ${r.recordName} ${r.entityName} ${r.operation}`
          .toLowerCase()
          .includes(q.toLowerCase()),
      )
    : displayRows;

  const allSelected = shown.length > 0 && shown.every((r) => selected.has(r.id));
  const someSelected = shown.some((r) => selected.has(r.id));
  const selectedRecords = Array.from(selected.values());
  const uniqueRecordCount = new Set(selectedRecords.map((r) => `${r.entityName}:${r.recordId}`)).size;

  function toggleRow(r: AuditRecord) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(r.id)) next.delete(r.id);
      else next.set(r.id, r);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Map(prev);
      if (allSelected) shown.forEach((r) => next.delete(r.id));
      else shown.forEach((r) => next.set(r.id, r));
      return next;
    });
  }
  function clearFilters() { setTable(""); setActionFilter("all"); setFromDate(""); setToDate(""); setQ(""); }

  async function handleRecycle() {
    if (selected.size === 0) return;
    setLoading(true);
    const result = await service.recycle(selectedRecords);
    setSelected(new Map());
    await reloadAudit();
    await loadBin();
    notify(result.message);
  }

  async function handleRestore() {
    if (selected.size === 0) return;
    setLoading(true);
    const result = await service.restore(selectedRecords.map((r) => r.id));
    setSelected(new Map());
    await loadBin();
    await reloadAudit();
    setLoading(false);
    notify(result.message);
  }

  async function handlePermanentDelete() {
    if (selected.size === 0) return;
    const confirmed = window.confirm(
      `PERMANENT DELETE — this cannot be undone.\n\n` +
      `A Power Automate flow will (1) email a backup of the ${selected.size} selected ` +
      `entry(ies), then (2) run the C# plugin to delete ALL audit history for ` +
      `${uniqueRecordCount} record(s).\n\nContinue?`,
    );
    if (!confirmed) return;
    setLoading(true);
    const result = await service.permanentlyDelete(selectedRecords);
    setSelected(new Map());
    await loadBin();
    await reloadAudit();
    notify(result.message);
  }

  function patchRow(updated: AuditRecord) {
    const apply = (list: AuditRecord[]) => list.map((r) => (r.id === updated.id ? updated : r));
    if (view === "audit") setRows(apply);
    else setBinRows(apply);
  }

  // Open the detail popup for a row, lazy-loading field changes if needed.
  async function openDetail(record: AuditRecord) {
    setDetail(record);
    if (record.changes === undefined) {
      const full = await service.getChanges(record);
      patchRow(full);
      setDetail((cur) => (cur && cur.id === full.id ? full : cur));
    }
  }

  const sortState = useMemo<Parameters<NonNullable<DataGridProps["onSortChange"]>>[1]>(
    () => ({ sortColumn: sortBy, sortDirection: sortDir === "asc" ? "ascending" : "descending" }),
    [sortBy, sortDir],
  );
  const onSortChange: DataGridProps["onSortChange"] = (_e, next) => {
    setSortBy(next.sortColumn as SortColumn);
    setSortDir(next.sortDirection === "ascending" ? "asc" : "desc");
  };

  const columns: TableColumnDefinition<AuditRecord>[] = useMemo(
    () => [
      createTableColumn<AuditRecord>({
        columnId: "select",
        renderHeaderCell: () => (
          <Checkbox
            checked={allSelected ? true : someSelected ? "mixed" : false}
            onChange={toggleSelectAll}
            aria-label="Select all"
          />
        ),
        renderCell: (item) => (
          <span onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selected.has(item.id)}
              onChange={() => toggleRow(item)}
              aria-label={`Select ${item.recordName}`}
            />
          </span>
        ),
      }),
      createTableColumn<AuditRecord>({
        columnId: "createdOn",
        compare: () => 0,
        renderHeaderCell: () => "Change Date",
        renderCell: (item) => <TableCellLayout>{formatTime(item.createdOn)}</TableCellLayout>,
      }),
      createTableColumn<AuditRecord>({
        columnId: "userName",
        renderHeaderCell: () => "Changed By",
        renderCell: (item) => <TableCellLayout>{item.userName}</TableCellLayout>,
      }),
      createTableColumn<AuditRecord>({
        columnId: "operation",
        compare: () => 0,
        renderHeaderCell: () => "Event",
        renderCell: (item) => (
          <Badge appearance="tint" color={eventBadgeColor(item.action)}>{item.operation}</Badge>
        ),
      }),
      createTableColumn<AuditRecord>({
        columnId: "entityName",
        compare: () => 0,
        renderHeaderCell: () => "Record",
        renderCell: (item) => (
          <TableCellLayout description={item.entityName}>{item.recordName}</TableCellLayout>
        ),
      }),
      createTableColumn<AuditRecord>({
        columnId: "fields",
        renderHeaderCell: () => "Changed Fields",
        renderCell: (item) => <TableCellLayout truncate>{fieldsSummary(item)}</TableCellLayout>,
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allSelected, someSelected, selected],
  );

  return (
    <FluentProvider theme={webLightTheme}>
      <div className={styles.root}>
        <header className={styles.header}>
          <Text as="h2" size={600} weight="semibold" className={styles.title}>{title}</Text>
          <TabList selectedValue={view} onTabSelect={(_e, d) => switchView(d.value as View)}>
            <Tab value="audit">Audit history</Tab>
            <Tab value="bin">Recycle Bin{binRows.length ? ` (${binRows.length})` : ""}</Tab>
          </TabList>
        </header>

        <div className={styles.toolbar}>
          <Field label="Table" className={styles.search}>
            <Input value={table} onChange={(_e, d) => setTable(d.value)} placeholder="Table logical name (e.g. account)" />
          </Field>
          <Field label="Search" className={styles.search}>
            <Input value={q} onChange={(_e, d) => setQ(d.value)} placeholder="Search…" />
          </Field>
          <Field label="Action">
            <Dropdown
              value={actionFilter === "all" ? "All actions" : ACTION_LABELS[actionFilter] ?? "All actions"}
              selectedOptions={[String(actionFilter)]}
              onOptionSelect={(_e, d) =>
                setActionFilter(d.optionValue === "all" ? "all" : Number(d.optionValue))
              }
            >
              <Option value="all">All actions</Option>
              {Object.entries(ACTION_LABELS).map(([code, label]) => (
                <Option key={code} value={code}>{label}</Option>
              ))}
            </Dropdown>
          </Field>
          <Field label="From">
            <Input type="date" value={fromDate} onChange={(_e, d) => setFromDate(d.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={toDate} onChange={(_e, d) => setToDate(d.value)} />
          </Field>
          <Button onClick={clearFilters}>Clear</Button>
        </div>

        {view === "audit" ? (
          <div className={styles.toolbar}>
            <span className={styles.spacer} />
            <Button appearance="primary" disabled={selected.size === 0 || loading} onClick={handleRecycle}>
              Move to Recycle Bin{selected.size ? ` (${selected.size})` : ""}
            </Button>
          </div>
        ) : (
          <div className={styles.toolbar}>
            <Text className={styles.binNote}>
              Items here are recoverable. Audit data is deleted only on permanent delete.
            </Text>
            <span className={styles.spacer} />
            <Button disabled={selected.size === 0 || loading} onClick={handleRestore}>
              Restore{selected.size ? ` (${selected.size})` : ""}
            </Button>
            <Button className={styles.dangerBtn} disabled={selected.size === 0 || loading} onClick={handlePermanentDelete}>
              Permanently delete{selected.size ? ` (${selected.size})` : ""}
            </Button>
          </div>
        )}

        <div className={styles.gridWrap} aria-busy={loading}>
          <DataGrid
            items={shown}
            columns={columns}
            getRowId={(item) => item.id}
            sortable={view === "audit"}
            sortState={sortState}
            onSortChange={onSortChange}
            focusMode="composite"
          >
            <DataGridHeader>
              <DataGridRow>
                {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
              </DataGridRow>
            </DataGridHeader>
            <DataGridBody<AuditRecord>>
              {({ item, rowId }) => (
                <DataGridRow<AuditRecord>
                  key={rowId}
                  className={styles.row}
                  onClick={() => openDetail(item)}
                >
                  {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>
          {shown.length === 0 && !loading ? (
            <div className={styles.empty}>
              {view === "audit" ? "No audit entries match this query." : "Recycle bin is empty."}
            </div>
          ) : null}
          {loading ? <div className={styles.loading}><Spinner label="Loading…" /></div> : null}
        </div>

        <footer className={styles.footer}>
          <Text className={styles.muted}>{selected.size > 0 ? `${selected.size} selected` : ""}</Text>
          {view === "audit" ? (
            <div className={styles.pager}>
              <Button disabled={pageIndex === 0 || loading} onClick={() => fetchPage(pageIndex - 1)}>Prev</Button>
              <Text className={styles.muted}>Page {pageIndex + 1}</Text>
              <Button disabled={!nextLink || loading} onClick={() => fetchPage(pageIndex + 1)}>Next</Button>
            </div>
          ) : <Text className={styles.muted}>{binRows.length} in bin</Text>}
        </footer>
      </div>

      <Dialog open={!!detail} onOpenChange={(_e, d) => { if (!d.open) setDetail(null); }}>
        <DialogSurface className={styles.dialogSurface}>
          <DialogBody>
            <DialogTitle>Audit entry detail</DialogTitle>
            <DialogContent>
              {detail ? (
                <>
                  <Card className={styles.detailCard}>
                    <CardHeader
                      header={<Text weight="semibold">{detail.recordName}</Text>}
                      description={
                        <Text className={styles.muted}>{detail.entityName} · {detail.recordId}</Text>
                      }
                      action={
                        <Checkbox
                          label="Select this entry"
                          checked={selected.has(detail.id)}
                          onChange={() => toggleRow(detail)}
                        />
                      }
                    />
                  </Card>

                  {detail.changes === undefined ? (
                    <Spinner label="Loading changes…" />
                  ) : detail.changes.length > 0 ? (
                    <Table aria-label="Field changes" className={styles.changesTable}>
                      <TableHeader>
                        <TableRow>
                          <TableHeaderCell>Change Date</TableHeaderCell>
                          <TableHeaderCell>Changed By</TableHeaderCell>
                          <TableHeaderCell>Event</TableHeaderCell>
                          <TableHeaderCell>Change Field</TableHeaderCell>
                          <TableHeaderCell>Old Value</TableHeaderCell>
                          <TableHeaderCell>New Value</TableHeaderCell>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.changes.map((c, i) => (
                          <TableRow key={i}>
                            <TableCell>{formatTime(c.changeDate)}</TableCell>
                            <TableCell>{c.changedBy}</TableCell>
                            <TableCell>
                              <Badge appearance="tint" color={eventBadgeColor(detail.action)}>{c.event}</Badge>
                            </TableCell>
                            <TableCell>{c.field}</TableCell>
                            <TableCell><span className={styles.oldVal}>{c.oldValue}</span></TableCell>
                            <TableCell><span className={styles.newVal}>{c.newValue}</span></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <Text>
                      {detail.operation} by {detail.userName} on {formatTime(detail.createdOn)} — no field-level changes recorded.
                    </Text>
                  )}
                </>
              ) : null}
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Toaster toasterId={toasterId} />
    </FluentProvider>
  );
}