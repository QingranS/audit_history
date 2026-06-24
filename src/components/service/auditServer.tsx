import type {
  AuditPage,
  AuditQuery,
  AuditRecord,
  DeleteResult,
  RecycleResult,
} from "../audittypes";

// The UI talks only to this interface. The local harness injects a mock
// implementation; the PCF control injects a Dataverse-backed one.
//
// Two-stage deletion:
//   recycle/restore  — non-destructive. Audit data is NOT touched; entries are
//                      just marked (a "recycle bin"). Fully reversible.
//   permanentlyDelete — the ONLY destructive path. Runs email backup first,
//                      then the C# plugin (DeleteRecordChangeHistory).
export interface AuditService {
  /** First page for a query. Recycled entries are excluded from results. */
  list(query: AuditQuery): Promise<AuditPage>;

  /** Follow an @odata.nextLink cursor to fetch the next page. */
  listMore(nextLink: string): Promise<AuditPage>;

  /** Lazy-load field-level changes (RetrieveAuditDetails) for one row. */
  getChanges(record: AuditRecord): Promise<AuditRecord>;

  // ---- Recycle bin (soft, recoverable) ----

  /** Move entries to the recycle bin. Audit data is untouched. */
  recycle(records: AuditRecord[]): Promise<RecycleResult>;

  /** List everything currently in the recycle bin. */
  listRecycleBin(): Promise<AuditRecord[]>;

  /** Restore entries from the recycle bin (un-mark them). */
  restore(auditIds: string[]): Promise<RecycleResult>;

  // ---- Permanent delete (destructive) ----

  /**
   * Permanently purge: queues a request that triggers a Power Automate flow to
   * (1) email the entries as a backup, then (2) invoke the C# plugin Custom API
   * that runs DeleteRecordChangeHistory. Only reachable from the recycle bin.
   */
  permanentlyDelete(records: AuditRecord[]): Promise<DeleteResult>;
}