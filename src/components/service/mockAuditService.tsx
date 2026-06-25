import type { AuditService } from "./auditServer";
import type {
  AuditPage,
  AuditQuery,
  AuditRecord,
  DeleteResult,
  RecycleResult,
} from "../audittypes";
import { withEventMeta } from "../audittypes";
import { parseAuditEntity } from "../odata/auditQuery";
import { generateMockAudit } from "./mockData";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FORMATTED = "@OData.Community.Display.V1.FormattedValue";

function toODataEntity(r: AuditRecord): Record<string, unknown> {
  // Serialize field changes into the same `changedata` JSON string shape the
  // real audit table returns, so parseAuditEntity can read them back.
  const changedata = JSON.stringify({
    changedAttributes: (r.changes ?? []).map((c) => ({
      logicalName: c.field,
      oldValue: c.oldValue,
      newValue: c.newValue,
    })),
  });
  const returnList = {auditid: r.id,
    createdon: r.createdOn,
    action: r.action,
    operation: r.action,
    [`operation${FORMATTED}`]: r.operation,
    objecttypecode: r.entityName,
    _objectid_value: r.recordId,
    [`_objectid_value${FORMATTED}`]: r.recordName,
    _userid_value: `user-${r.userName}`,
    [`_userid_value${FORMATTED}`]: r.userName,
    changedata,};
  return returnList;
}

interface Cursor {
  index: number;
  query: AuditQuery;
}
function encodeCursor(c: Cursor): string {
  return `mock://audit?c=${btoa(encodeURIComponent(JSON.stringify(c)))}`;
}
function decodeCursor(link: string): Cursor {
  const enc = new URL(link).searchParams.get("c") ?? "";
  return JSON.parse(decodeURIComponent(atob(enc))) as Cursor;
}

export class MockAuditService implements AuditService {
  private rows: AuditRecord[];
  // Recycle bin: audit rows are NOT removed from `rows`; they're just marked
  // here and filtered out of list results, mirroring the real marking layer.
  private binnedIds = new Set<string>();
  private binned = new Map<string, AuditRecord>();

  constructor(seed=20) {
    this.rows = generateMockAudit(seed);
  }

  private visibleRows(): AuditRecord[] {
    return this.rows.filter((r) => !this.binnedIds.has(r.id));
  }

  private applyQuery(query: AuditQuery): AuditRecord[] {
    let out = this.visibleRows();
    if (query.objectTypeCode) out = out.filter((r) => r.entityName === query.objectTypeCode);
    if (query.action != null && query.action !== "all") out = out.filter((r) => r.action === query.action);
    if (query.fromDate) out = out.filter((r) => r.createdOn >= query.fromDate!);
    if (query.toDate) out = out.filter((r) => r.createdOn <= query.toDate!);

    const key = ({ createdOn: "createdOn", operation: "operation", entityName: "entityName" } as const)[
      query.sortBy
    ];
    const dir = query.sortDir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => (a[key] < b[key] ? -dir : a[key] > b[key] ? dir : 0));
  }

  private pageAt(query: AuditQuery, index: number): AuditPage {
    const all = this.applyQuery(query);
    const start = index * query.pageSize;
    const slice = all.slice(start, start + query.pageSize);
    // Round-trips through `changedata`, so parseAuditEntity rebuilds the changes.
    const rows = slice.map(toODataEntity).map(parseAuditEntity);
    const hasMore = start + query.pageSize < all.length;
    return { rows, nextLink: hasMore ? encodeCursor({ index: index + 1, query }) : undefined };
  }

  async list(query: AuditQuery): Promise<AuditPage> {
    await delay(180);
    return this.pageAt(query, 0);
  }

  async listMore(nextLink: string): Promise<AuditPage> {
    await delay(160);
    const { index, query } = decodeCursor(nextLink);
    return this.pageAt(query, index);
  }

  async getChanges(record: AuditRecord): Promise<AuditRecord> {
    await delay(120);
    // Look up the original generated row (the list round-trip strips changes),
    // then stamp event metadata so each change row carries date / user / event.
    const source = this.rows.find((r) => r.id === record.id);
    record.changes = withEventMeta(record, source?.changes ?? record.changes ?? []);
    return record;
  }

  // ---- recycle bin ----

  async recycle(records: AuditRecord[]): Promise<RecycleResult> {
    await delay(160);
    for (const r of records) {
      this.binnedIds.add(r.id);
      this.binned.set(r.id, r);
    }
    return { count: records.length, message: `Moved ${records.length} entry(ies) to the recycle bin.` };
  }

  async listRecycleBin(): Promise<AuditRecord[]> {
    await delay(120);
    return Array.from(this.binned.values()).sort((a, b) => (a.createdOn < b.createdOn ? 1 : -1));
  }

  async restore(auditIds: string[]): Promise<RecycleResult> {
    await delay(140);
    for (const id of auditIds) {
      this.binnedIds.delete(id);
      this.binned.delete(id);
    }
    return { count: auditIds.length, message: `Restored ${auditIds.length} entry(ies) from the recycle bin.` };
  }

  // ---- permanent delete ----

  async permanentlyDelete(records: AuditRecord[]): Promise<DeleteResult> {
    await delay(260);
    const recordIds = new Set(records.map((r) => r.recordId));
    const auditIds = new Set(records.map((r) => r.id));
    // Simulate the flow's end state: email sent + plugin purged the history.
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !recordIds.has(r.recordId));
    for (const id of auditIds) {
      this.binnedIds.delete(id);
      this.binned.delete(id);
    }
    const deletedCount = before - this.rows.length;
    return {
      deletedCount,
      message:
        `Permanent delete queued: backup email sent, C# plugin purged ${deletedCount} ` +
        `audit row(s) across ${recordIds.size} record(s).`,
    };
  }
}