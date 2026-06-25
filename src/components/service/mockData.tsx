// it is just the mocked up data, using for testing only.
import type { AuditRecord, FieldDiff } from "../audittypes";
import { withEventMeta } from "../audittypes";

const USERS = [
    "Avery Chen",
    "Joradn Patel",
    "Sam Rivera",
    "Morgan Li",
    "Casey Nguyen",
    "SYSTEM",
];

const ENTITIES: { logical: string; records: string[] }[] = [
    { logical: "organization", records: ["MPS Phase 2 Dev", "Contoso Org"] },
    { logical: "account", records: ["Contoso Ltd", "Fabrikam Inc", "Northwind Traders", "Adventure Work"] },
    { logical: "contact", records: ["Maria Campbell", "Henry Ross", "Pariya Shah", "Leo Martins"] },
    { logical: "opportunity", records: ["Q3 Renewal - Contoso", "New Logo - Fabrikam", "Upsell - Northwind"] },
    { logical: "incident", records: ["CAS-01042 Login issue", "CAS-01198 Billing error"] },
];

const FIELDS: Record<string, string[]> = {
    organization: ["syncoptinselectionstatus", "syncoptinselection", "name"],
    account: ["name", "telephone1", "revenue", "ownerid", "address1_city"],
    contact: ["fullname", "emailaddress1", "jobtitle", "telephone1"],
    opportunity: ["estimatedvalue", "stagename", "estimatedclosedate", "ownerid"],
    incident: ["statuscode", "prioritycode", "ownerid"],
};

// Realistic before/after pairs for known fields (mirrors how Dataverse returns
// option-set / boolean changes with display names). Falls back to generated
// strings for anything not listed here.
const VALUE_PAIRS: Record<string, [string, string]> = {
    syncoptinselectionstatus: ["Processing", "Passed"],
    syncoptinselection: ["True", "False"],
    statuscode: ["In Progress", "Resolved"],
    prioritycode: ["Normal", "High"],
    stagename: ["Qualify", "Propose"],
};

const ACTIONS = [1, 2, 2, 2, 3, 4, 64];

function pick<T>(arr: T[], i: number): T {
    return arr[i % arr.length]
}

function makeChange(entity: string, seed: number): FieldDiff[] {
    const fields = FIELDS[entity] ?? ["field_a", "field_b"];
    const n = (seed % 3) + 1;
    return Array.from({ length: n }, (_, k) => {
        const field = pick(fields, seed + k);
        const pair = VALUE_PAIRS[field];
        return pair
            ? { field, oldValue: pair[0], newValue: pair[1] }
            : {
                field,
                oldValue: `old-${field}-${seed}`,
                newValue: `new-${field}-${seed + 1}`,
            };
    });
}

export function generateMockAudit(count = 64): AuditRecord[]{
    const now = Date.now()
    const rows: AuditRecord[] = [];
    for(let i = 0; i < count; i++){
        const ent = pick(ENTITIES, i);
        const recName = pick(ent.records, i * 3 + 1);
        const action = pick(ACTIONS, i * 11);
        const minutesAge = i * 137 + (i % 11) * 53;
        const record: AuditRecord = {
            id: `aud-${10000 + i}`,
            createdOn: new Date(now - minutesAge * 60_000).toISOString(),
            action,
            operation:
                {
                1: "Create",
                2: "Update",
                3: "Delete",
                4: "Access",
                5: "Activate",
                64: "User Access via Web"}[action] ?? "Update",
            userName: pick(USERS, i * 5 + 2),
            entityName:ent.logical,
            recordName:recName,
            recordId:`rec-${ent.logical}-${i % ent.records.length + 1}`,
            changes: [],
        };
        record.changes =
            action === 2 || action === 1 ? withEventMeta(record, makeChange(ent.logical, i)) : [];
        rows.push(record);
    }
    return rows;
}