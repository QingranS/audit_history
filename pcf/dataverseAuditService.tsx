import type { AuditService } from "../src/components/service/auditServer";
import type {
  AuditPage,
  AuditQuery,
  AuditRecord,
  AuditScope,
  DeleteResult,
  RecycleResult,
} from "../src/components/audittypes";
import { withEventMeta } from "../src/components/audittypes";
import { buildAuditOptions, parseAuditEntity } from "../src/components/odata/auditQuery";


interface DataverseWebApi {
  retrieveMultipleRecords(
    entityType: string,
    options?: string,
  ): Promise<{ entities: Record<string, unknown>[]; nextLink?: string }>;
  createRecord(entityType: string, data: Record<string, unknown>): Promise<{ id: string }>;
  deleteRecord(entityType: string, id: string): Promise<unknown>;
}

const API = "/api/data/v9.2";
const BIN_TABLE = "new_auditbinitem";        // one row per recycled audit entry
const PURGE_TABLE = "new_auditpurgerequest"; // one row per permanent-delete request

interface RetrieveMultipleResponse {
  entities: Record<string, unknown>[];
  nextLink?: string;
}

async function webApiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json; charset=utf-8",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      ...(init?.headers ?? {}),
    },
  });
}

export class DataverseAuditService implements AuditService {
  private binnedIds = new Set<string>();
  private binLoaded = false;

  constructor(
    private webAPI: DataverseWebApi,
    private scope?: AuditScope,
    private backupRecipient?: string,
  ) {}

  private async refreshBin(): Promise<void> {
    const res = (await this.webAPI.retrieveMultipleRecords(
      BIN_TABLE,
      `?$select=new_auditid&$top=5000`,
    )) as unknown as RetrieveMultipleResponse;
    this.binnedIds = new Set(res.entities.map((e) => String(e["new_auditid"])));
    this.binLoaded = true;
  }

  private async pageFrom(options: string): Promise<AuditPage> {
    if (!this.binLoaded) await this.refreshBin();
    const res = (await this.webAPI.retrieveMultipleRecords(
      "audit",
      options,
    )) as unknown as RetrieveMultipleResponse;
    const rows = res.entities
      .map(parseAuditEntity)
      .filter((r) => !this.binnedIds.has(r.id)); // exclude recycled
    return { rows, nextLink: res.nextLink };
  }

  async list(query: AuditQuery): Promise<AuditPage> {
    return this.pageFrom(buildAuditOptions(query, this.scope ?? ({} as AuditScope)));
  }

  async listMore(nextLink: string): Promise<AuditPage> {
    return this.pageFrom(nextLink.substring(nextLink.indexOf("?")));
  }

  async getChanges(record: AuditRecord): Promise<AuditRecord> {
    const resp = await webApiFetch(
      `/audits(${record.id})/Microsoft.Dynamics.CRM.RetrieveAuditDetails`,
    );
    if (!resp.ok) return record;
    const data = await resp.json();
    const detail = data?.AuditDetail ?? {};
    const oldVals: Record<string, unknown> = detail.OldValue ?? {};
    const newVals: Record<string, unknown> = detail.NewValue ?? {};
    const fields = [...new Set([...Object.keys(oldVals), ...Object.keys(newVals)])];
    const diffs = fields
      .filter((f) => !f.startsWith("@"))
      .map((f) => ({
        field: f,
        oldValue: oldVals[f] == null ? "" : String(oldVals[f]),
        newValue: newVals[f] == null ? "" : String(newVals[f]),
      }));
    record.changes = withEventMeta(record, diffs);
    return record;
  }

  // ---- recycle bin (non-destructive) ----

  async recycle(records: AuditRecord[]): Promise<RecycleResult> {
    for (const r of records) {
      await this.webAPI.createRecord(BIN_TABLE, {
        new_name: `${r.entityName}: ${r.recordName}`,
        new_auditid: r.id,
        new_entityname: r.entityName,
        new_recordid: r.recordId,
        new_payload: JSON.stringify(r),
      });
      this.binnedIds.add(r.id);
    }
    return { count: records.length, message: `Moved ${records.length} entry(ies) to the recycle bin.` };
  }

  async listRecycleBin(): Promise<AuditRecord[]> {
    const res = (await this.webAPI.retrieveMultipleRecords(
      BIN_TABLE,
      `?$select=new_auditbinitemid,new_payload&$orderby=createdon desc&$top=5000`,
    )) as unknown as RetrieveMultipleResponse;
    return res.entities.map((e) => {
      const rec = JSON.parse(String(e["new_payload"])) as AuditRecord;
      // stash the bin row id on the record so restore() can delete it
      (rec as AuditRecord & { _binId?: string })._binId = String(e["new_auditbinitemid"]);
      return rec;
    });
  }

  async restore(auditIds: string[]): Promise<RecycleResult> {
    // Look up bin rows for these audit ids and delete them.
    const ids = new Set(auditIds);
    const res = (await this.webAPI.retrieveMultipleRecords(
      BIN_TABLE,
      `?$select=new_auditbinitemid,new_auditid&$top=5000`,
    )) as unknown as RetrieveMultipleResponse;
    let count = 0;
    for (const e of res.entities) {
      if (ids.has(String(e["new_auditid"]))) {
        await this.webAPI.deleteRecord(BIN_TABLE, String(e["new_auditbinitemid"]));
        this.binnedIds.delete(String(e["new_auditid"]));
        count++;
      }
    }
    return { count, message: `Restored ${count} entry(ies) from the recycle bin.` };
  }

  // ---- permanent delete (destructive) ----

  async permanentlyDelete(records: AuditRecord[]): Promise<DeleteResult> {
    const seen = new Set<string>();
    const targets: string[] = [];
    for (const r of records) {
      const key = `${r.entityName}:${r.recordId}`;
      if (!seen.has(key)) { seen.add(key); targets.push(key); }
    }
    const payload = {
      requestedOnUtc: new Date().toISOString(),
      recipient: this.backupRecipient ?? "",
      entries: records.map((r) => ({
        auditId: r.id, createdOn: r.createdOn, operation: r.operation,
        user: r.userName, table: r.entityName, record: r.recordName, recordId: r.recordId,
      })),
      targets,
    };
    // Queue the request. The flow emails the backup, then calls the plugin.
    const created = await this.webAPI.createRecord(PURGE_TABLE, {
      new_name: `Audit purge — ${targets.length} record(s) @ ${payload.requestedOnUtc}`,
      new_payload: JSON.stringify(payload),
      new_status: 1, // PendingPurge (adjust to your choice values)
      ...(this.backupRecipient ? { new_recipient: this.backupRecipient } : {}),
    });

    // Remove them from the bin view immediately; the flow does the real purge.
    await this.restore(records.map((r) => r.id)).catch(() => undefined);

    return {
      deletedCount: 0, // runs asynchronously in the flow + plugin
      message: `Permanent delete queued (${created.id}). Backup email + plugin will purge ${targets.length} record(s).`,
    };
  }
}