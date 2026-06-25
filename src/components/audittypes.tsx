// Domain model for an audit entry.


export const ACTION_LABELS: Record<number, string> = {
  1: "Create",
  2: "Update",
  3: "Delete",
  4: "Access",
  5: "Activate",
  64: "User Access via Web",
};

export interface AuditChange {
  field: string;
  oldValue: string;
  newValue: string;
  changeDate: string;
  changedBy: string;
  event: string;
}

export interface AuditRecord {
  /** auditid */
  id: string;
  /** ISO 8601 timestamp (createdon) */
  createdOn: string;
  /** numeric action code from Dataverse */
  action: number;
  /** display label, e.g. "Update" */
  operation: string;
  /** user who made the change (_userid_value formatted) */
  userName: string;
  /** logical name of the audited table, e.g. "account" */
  entityName: string;
  /** primary name of the audited record */
  recordName: string;
  /** GUID of the audited record (_objectid_value) */
  recordId: string;
  /** lazy-loaded field changes */
  changes?: AuditChange[];
}

export type SortColumn = "createdOn" | "operation" | "entityName";
export type SortDirection = "asc" | "desc";

// Filters here map 1:1 to OData $filter clauses the audit table supports.
export interface AuditQuery {
  /** objecttypecode eq '<logical name>' */
  objectTypeCode?: string;
  /** action eq <code>, or "all" */
  action?: number | "all";
  /** createdon ge <iso> */
  fromDate?: string;
  /** createdon le <iso> */
  toDate?: string;
  sortBy: SortColumn;
  sortDir: SortDirection;
  pageSize: number;
}

// One page of results. `nextLink` is the OData cursor for the following page;
// absent when there are no more rows.
export interface AuditPage {
  rows: AuditRecord[];
  nextLink?: string;
}

// Optional scope: restrict to a single audited record's history.
export interface AuditScope {
  entityName: string;
  recordId: string;
}

// Result of a permanent (destructive) delete.
export interface DeleteResult {
  deletedCount: number;
  message: string;
}

// Result of a recycle-bin operation (recycle / restore) — non-destructive.
export interface RecycleResult {
  count: number;
  message: string;
}

// Raw field-level diff, before the event metadata is stamped on.
export type FieldDiff = Pick<AuditChange, "field" | "oldValue" | "newValue">;

// Stamp the audit event's metadata (date / user / operation) onto each raw
// field diff so every change row is self-contained for the detail card.
export function withEventMeta(record: AuditRecord, diffs: FieldDiff[]): AuditChange[] {
  return diffs.map((d) => ({
    ...d,
    changeDate: record.createdOn,
    changedBy: record.userName,
    event: record.operation,
  }));
}