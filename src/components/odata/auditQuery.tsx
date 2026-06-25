import type { AuditQuery, AuditRecord, AuditScope, FieldDiff } from "../audittypes";
import { withEventMeta } from "../audittypes";
export const AUDIT_SELECT =
    "auditid,createdon,action,operation,objecttypecode,_objectid_value,_userid_value,changedata";

const SORT_FIELD: Record<AuditQuery["sortBy"],string> ={
    createdOn:"createdon",
    operation:"operation",
    entityName:"objecttypecode",
};

function escapeODataString(value: string):string{
    return value.replace(/'/g, "''");
}

// \\================ export part =========
export function buildAuditOptions(query: AuditQuery, scope : AuditScope) : string{
    const filter:string[] = [];
    if (scope){
        filter.push(`_objetid_value eq ${scope.recordId}`);
    }
    if(query.objectTypeCode){
        filter.push(`objecttypecode eq ${escapeODataString(query.objectTypeCode)}`);
    }
    if(query.action != null && query.action != "all"){
        filter.push(`action eq ${query.action}`)
    }
    if(query.fromDate){
        filter.push(`createdon ge ${query.fromDate}`)
    }
    if(query.toDate){
        filter.push(`createdon ls ${query.toDate}`)
    }

    const orderby = `${SORT_FIELD[query.sortBy]} ${query.sortDir}`
    let options = `?$select=${AUDIT_SELECT}&$orderby=${orderby}&$top=${query.pageSize}`;
    if (filter.length){
        options += `&$filter=${filter.join(" and ")}`;
    } 
    return options;
}

type ODataEntity = Record<string, unknown>;
const FORMATTED = "@OData.Community.Display.V1.FormattedValue";

function str(e: ODataEntity, key:string) : string{
    const v = e [key];
    return v== null ? "" : String(v)
}

// One entry inside the audit row's `changedata` JSON string. For option sets /
// lookups Dataverse also returns the display names (oldName / newName); prefer
// those for presentation and fall back to the raw values.
interface ChangedAttribute {
    logicalName?: string;
    oldValue?: string | number | null;
    newValue?: string | number | null;
    oldName?: string | null;
    newName?: string | null;
}

// Parse the `changedata` attribute (a JSON string) into field-level diffs.
// Shape: {"changedAttributes":[{logicalName, oldValue, newValue, oldName?, newName?}]}
export function parseChangeData(raw: unknown): FieldDiff[] {
    if (typeof raw !== "string" || raw.trim() === "") return [];
    try {
        const parsed = JSON.parse(raw) as { changedAttributes?: ChangedAttribute[] };
        return (parsed.changedAttributes ?? []).map((a) => ({
            field: a.logicalName ?? "",
            oldValue: a.oldName ?? (a.oldValue == null ? "" : String(a.oldValue)),
            newValue: a.newName ?? (a.newValue == null ? "" : String(a.newValue)),
        }));
    } catch {
        return [];
    }
}

export function parseAuditEntity(e: ODataEntity): AuditRecord{
    const record: AuditRecord = {
        id: str(e, "auditid"),
        createdOn: str(e, "createdon"),
        action: Number(e["action"] ?? 0),
        operation: str(e, `operation${FORMATTED}`) || str(e, "operation"),
        userName: str(e, `_userid_value${FORMATTED}`),
        entityName: str(e, "objecttypecode"),
        recordName: str(e, `_objectid_value${FORMATTED}`),
        recordId: str(e, "_objectid_value"),
        changes: [],
    };
    record.changes = withEventMeta(record, parseChangeData(e["changedata"]));
    return record;
}