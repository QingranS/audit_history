import type { AuditQuery, AuditRecord, AuditScope } from "../audittypes";
export const AUDIT_SELECT = 
    "auditid,createdon,action,operation,objectttypecode,_objectid_value,_userid_value";

const SORT_FIELD: Record<AuditQuery["sortBy"],string> ={
    createdOn:"createdon",
    operation:"operation",
    entityName:"objettypecode",
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

export function parseAuditEntity(e: ODataEntity): AuditRecord{
    return{
        id: str(e, "auditid"),
        createdOn: str(e, "createdon"),
        action: Number(e["action"] ?? 0),
        operation: str(e, `operation${FORMATTED}`) || str(e, "operation"),
        userName: str(e, `_userid_value${FORMATTED}`),
        entityName: str(e, "objecttypecode"),
        recordName: str(e, `_objectid_value${FORMATTED}`),
        recordId: str(e, "_objectid_value"),
    };
}