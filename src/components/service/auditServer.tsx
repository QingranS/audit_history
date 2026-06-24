import type {AuditPage, AuditQuery, AuditRecord, DeleteResult } from "../audittypes"

export interface AuditService {
    list(query: AuditQuery): Promise<AuditPage>;
    listMore(nextLink: string): Promise<AuditPage>;
    getChange(record: AuditRecord): Promise<AuditRecord>;
    deleteRecordChangeHistory(recordIds: string[]): Promise<DeleteResult>;
}