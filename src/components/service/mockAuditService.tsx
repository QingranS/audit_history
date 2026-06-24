import type { AuditService } from "./auditServer";
import type { AuditPage, AuditQuery, AuditRecord, DeleteResult } from "../audittypes";
import { parseAuditEntity } from "../odata/auditQuery";
import { generateMockAudit } from "./mockData";
import { parse } from "date-fns";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FORMATTED = "@ODdata.Community.Display.V1.FormattedValue";

function toODataEntry(r: AuditRecord): Record<string, unknown> {
    return {
        auditid: r.id,
        createdon: r.createdOn,
        action: r.action,
        operation: r.action,
        [`operation${FORMATTED}`]: r.operation,
        objecttypecode: r.entityName,
        _objectid_value: r.recordId,
        [`_objectid_value${FORMATTED}`]: r.recordName,
        _userid_value: `user-${r.userName}`,
        [`_userid_value${FORMATTED}`]: r.userName,
    }
}

interface Cursor {
    index: number;
    query: AuditQuery;
}
function endcodeCursor(c: Cursor): string {
    return `mock://audit?c=${btoa(encodeURIComponent(JSON.stringify(c)))}`;
}

function decodeCursor(link: string): Cursor {
    const enc = new URL(link).searchParams.get("c") ?? "";
    return JSON.parse(decodeURIComponent(atob(enc))) as Cursor;
}

export class MockAuditService implements AuditService {
    private rows: AuditRecord[];
    constructor(seed = 240) {
        this.rows = generateMockAudit(seed);
    }

    private applyQuery(query: AuditQuery): AuditRecord[] {
        let out = this.rows;
        if (query.objectTypeCode) {
            out = out.filter((r) => r.entityName === query.objectTypeCode);
        }
        if (query.action != null && query.action !== "all") {
            out = out.filter((r) => r.action === query.action);
        }
        if (query.fromDate) {
            out = out.filter((r) => r.createdOn >= query.fromDate!);
        }
        if (query.toDate) {
            out = out.filter((r) => r.createdOn < query.toDate!);
        }
        const key = ({ createdOn: "createdOn", operation: "operation", entityName: "entityName" } as const)[query.sortBy];
        const dir = query.sortDir === "asc" ? 1 : -1;
        return [...out].sort((a, b) => (a[key] < b[key] ? -dir : a[key] > b[key] ? dir : 0))
    }
    private pageAt(query: AuditQuery, index: number): AuditPage {
        const all = this.applyQuery(query);
        const start = index * query.pageSize;
        const slice = all.slice(start, start + query.pageSize);
        const rows = slice.map(toODataEntry).map(parseAuditEntity);
        const hasMore = start + query.pageSize < all.length ;
        return { rows, nextLink: hasMore? endcodeCursor({index: index + 1, query}):undefined}
    }
    async list(query:AuditQuery): Promise<AuditPage> {
        await delay(90);
        return this.pageAt(query, 0);
    }
    async listMore(newLink: string): Promise<AuditPage> {
        await delay(100);
        const {index, query} = decodeCursor(newLink);
        return this.pageAt(query, index);
    }

    async getChange(record: AuditRecord): Promise<AuditRecord> {
        await delay(300);
        return record;
    }

    async deleteRecordChangeHistory(recordIds: string[]): Promise<DeleteResult> {
        await delay(120);
        const before = this.rows.length;
        this.rows = this.rows.filter((r) => !recordIds.includes(r.recordId));
        const deletedCount = before - this.rows.length;
        return{
            deleteCount: deletedCount,
            message: `Deleted all audit history for ${recordIds.length} record(s) - ${deletedCount} audit row(s) removed.`
        };
    }

}