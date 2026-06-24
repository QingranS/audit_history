import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuditService } from "../components/service/auditServer"
import type { AuditQuery, AuditRecord, SortColumn, SortDirection } from "../components/audittypes";
import { ACTION_LABELS } from "../components/audittypes";
import "./AuditGrid.css";

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
function actionTone(code: number): string {
  if (code === 1) return "tone-create";
  if (code === 2) return "tone-update";
  if (code === 3) return "tone-delete";
  return "tone-access";
}
const startOfDay = (d: string) => (d ? `${d}T00:00:00Z` : undefined);
const endOfDay = (d: string) => (d ? `${d}T23:59:59Z` : undefined);

export function AuditGrid({ service, title = "Audit history", pageSize = 25 }: Props) {
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
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
    setExpanded(null);
    if (v === "bin") void loadBin();
  }

  const displayRows = view === "audit" ? rows : binRows;
  const allSelected = displayRows.length > 0 && displayRows.every((r) => selected.has(r.id));
  const selectedRecords = Array.from(selected.values());
  const uniqueRecordCount = new Set(selectedRecords.map((r) => `${r.entityName}:${r.recordId}`)).size;

  function toggleSort(col: SortColumn) {
    if (view !== "audit") return;
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("desc"); }
  }
  function toggleRow(r: AuditRecord) {
    setSelected((prev) => {
      const next = new Map(prev);
      next.has(r.id) ? next.delete(r.id) : next.set(r.id, r);
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
  function clearFilters() { setTable(""); setActionFilter("all"); setFromDate(""); setToDate(""); setQ("") }

  async function handleRecycle() {
    if (selected.size === 0) return;
    setLoading(true);
    const result = await service.recycle(selectedRecords);
    setSelected(new Map());
    setToast(result.message);
    await reloadAudit();
    await loadBin();
    setTimeout(() => setToast(null), 4000);
  }

  async function handleRestore() {
    if (selected.size === 0) return;
    setLoading(true);
    const result = await service.restore(selectedRecords.map((r) => r.id));
    setSelected(new Map());
    setToast(result.message);
    await loadBin();
    await reloadAudit();
    setLoading(false);
    setTimeout(() => setToast(null), 4000);
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
    setToast(result.message);
    await loadBin();
    await reloadAudit();
    setTimeout(() => setToast(null), 5000);
  }

  async function toggleExpand(record: AuditRecord) {
    if (expanded === record.id) { setExpanded(null); return; }
    setExpanded(record.id);
    if (!record.changes) await service.getChanges(record);
  }

  const shown = q?displayRows.filter( r => 
    `${r.userName} ${r.recordName} ${r.operation} ${r.operation}`.toLocaleLowerCase().includes(q.toLowerCase())
  ): displayRows;
  function sortIndicator(col: SortColumn) {
    if (view !== "audit" || sortBy !== col) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  return (
    <div className="audit-grid flex justify-center h-screen">
      <header className="ag-head flex justify-center h-screen">
        <h2>{title}</h2>
        <div className="ag-tabs flex justify-center h-screen">
          <button className={view === "audit" ? "ag-tab on" : "ag-tab"} onClick={() => switchView("audit")}>
            Audit history
          </button>
          <button className={view === "bin" ? "ag-tab on" : "ag-tab"} onClick={() => switchView("bin")}>
            Recycle Bin{binRows.length ? ` (${binRows.length})` : ""}
          </button>
        </div>
      </header>
      <div className="ag-toolbar">
          <input className="ag-search" type="text" placeholder="Table logical name (e.g. account)"
            value={table} onChange={e => {setTable(e.target.value)}} aria-label="Filter by table" />
          <input className="ag-search" type="text" placeholder="Search Here"
            value={q} onChange={e => {setQ(e.target.value)}} aria-label="Filter by table" />
          <select className="ag-filter" value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            aria-label="Filter by action">
            <option value="all">All actions</option>
            {Object.entries(ACTION_LABELS).map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
          <label className="ag-date">From <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></label>
          <label className="ag-date">To <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></label>
          <button className="ag-ghost" onClick={clearFilters}>Clear</button>
      </div>
      {view === "audit" ? (
        <div className="ag-toolbar">
          
          <span className="ag-spacer" />
          <button className="ag-recycle" disabled={selected.size === 0 || loading} onClick={handleRecycle}>
            Move to Recycle Bin{selected.size ? ` (${selected.size})` : ""}
          </button>
        </div>
      ) : (
        <div className="ag-toolbar">
          <span className="ag-bin-note">Items here are recoverable. Audit data is deleted only on permanent delete.</span>
          <span className="ag-spacer" />
          <button className="ag-ghost" disabled={selected.size === 0 || loading} onClick={handleRestore}>
            Restore{selected.size ? ` (${selected.size})` : ""}
          </button>
          <button className="ag-delete" disabled={selected.size === 0 || loading} onClick={handlePermanentDelete}>
            Permanently delete{selected.size ? ` (${selected.size})` : ""}
          </button>
        </div>
      )}

      <div className="ag-table-wrap flex justify-center h-screen" aria-busy={loading}>
        <table className="ag-table">
          <thead>
            <tr>
              <th className="ag-cb">
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Select all" />
              </th>
              <th className={view === "audit" ? "ag-sortable" : ""} onClick={() => toggleSort("createdOn")}>Changed{sortIndicator("createdOn")}</th>
              <th className={view === "audit" ? "ag-sortable" : ""} onClick={() => toggleSort("operation")}>Event{sortIndicator("operation")}</th>
              <th>Changed by</th>
              <th className={view === "audit" ? "ag-sortable" : ""} onClick={() => toggleSort("entityName")}>Record{sortIndicator("entityName")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <Fragment key={r.id}>
                <tr className={selected.has(r.id) ? "ag-row sel" : "ag-row"}>
                  <td className="ag-cb">
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleRow(r)} aria-label={`Select ${r.id}`} />
                  </td>
                  <td className="ag-time">{formatTime(r.createdOn)}</td>
                  <td><span className={`ag-pill ${actionTone(r.action)}`}>{r.operation}</span></td>
                  <td>{r.userName}</td>
                  <td>
                    <span className="ag-record">{r.recordName}</span>
                    <span className="ag-entity">{r.entityName}</span>
                  </td>
                  <td className="ag-expand">
                    {r.changes && r.changes.length > 0 ? (
                      <button className="ag-link" onClick={() => toggleExpand(r)}>
                        {expanded === r.id ? "Hide" : "Details"}
                      </button>
                    ) : null}
                  </td>
                </tr>
                {expanded === r.id && r.changes && r.changes.length > 0 ? (
                  <tr className="ag-detail-row">
                    <td colSpan={6}>
                      <table className="ag-changes">
                        <thead><tr><th>Field</th><th>Old value</th><th>New value</th></tr></thead>
                        <tbody>
                          {r.changes.map((c, i) => (
                            <tr key={i}><td>{c.field}</td><td className="old">{c.oldValue}</td><td className="new">{c.newValue}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
            {displayRows.length === 0 && !loading ? (
              <tr><td colSpan={6} className="ag-empty">
                {view === "audit" ? "No audit entries match this query." : "Recycle bin is empty."}
              </td></tr>
            ) : null}
          </tbody>
        </table>
        {loading ? <div className="ag-loading">Loading…</div> : null}
      </div>

      <footer className="ag-foot">
        <span className="ag-sel-info">{selected.size > 0 ? `${selected.size} selected` : ""}</span>
        {view === "audit" ? (
          <div className="ag-pager">
            <button disabled={pageIndex === 0 || loading} onClick={() => fetchPage(pageIndex - 1)}>Prev</button>
            <span>Page {pageIndex + 1}</span>
            <button disabled={!nextLink || loading} onClick={() => fetchPage(pageIndex + 1)}>Next</button>
          </div>
        ) : <span className="ag-sel-info">{binRows.length} in bin</span>}
      </footer>

      {toast ? <div className="ag-toast">{toast}</div> : null}
    </div>
  );
}