export type AuditActionCode = 1 | 2 | 3 | 4 | 5 | 64;

export const ACTION_LABELS: Record<number, string> = {
    1: "Create",
    2: "Update",
    3: "Delete",
    4: "Access",
    5: "Activate",
    64: "User Access via Web",
};


// ===============interface ===========

export interface AuditChange {
    field: string;
    oldValue: string;
    newValue: string;
}

export interface AuditRecord {
    id: string;
    createdOn: string;
    action: number;
    operation: string;
    userName: string;
    entityName: string;
    recordName: string;
    recordId: string;
    changes?: AuditChange[];
}

export interface AuditQuery {
    objectTypeCode?: string;
    action?: number | "all";
    fromDate?: string;
    toDate?: string;
    sortBy:SortColumn;
    sortDir: SortDirection;
    pageSize: number;
}

export interface AuditPage {
    rows: AuditRecord[];
    nextLink?:string;
}

export interface AuditScope{
    entityName: string;
    recordId: string;
}

export interface DeleteResult{
    deleteCount: number;
    message: string;
}

// ============= sort ================
export type SortColumn = "createdOn" | "operation" | "entityName";

export type SortDirection = "asc" | "desc";

