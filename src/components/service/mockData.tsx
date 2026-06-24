// it is just the mocked up data, using for testing only. 
import type { AuditChange, AuditRecord } from "../audittypes";

const USERS = [
    "Avery Chen",
    "Joradn Patel",
    "Sam Rivera",
    "Morgan Li",
    "Casey Nguyen",
    "SYSTEM",
];

const ENTITIES: { logical: string; records: string[] }[] = [
    { logical: "account", records: ["Contoso Ltd", "Fabrikam Inc", "Northwind Traders", "Adventure Work"] },
    { logical: "contact", records: ["Maria Campbell", "Henry Ross", "Pariya Shah", "Leo Martins"] },
    { logical: "oppoturnity", records: ["Q3 Renewal - Contoso", "New Logo - Fabrikam", "Upsell - Northwind"] },
    { logical: "incident", records: ["CAS-01042 Login issue", "CAS-01198 Billing error"] },
];

const FIELDS: Record<string, string[]> = {
    account: ["name", "Phone", "Anual Revenue", "Owner", "City"],
    contact: ["Full Name", "Email", "Job Title", "Phone"],
    opportunity: ["Est.Revenue", "Stage", "Close Date", "Owner"],
    incident: ["Status", "Priority", "Assigned To"],
};

const ACTIONS = [1, 2, 2, 2, 3, 4, 64];

function pick<T>(arr: T[], i: number): T {
    return arr[i % arr.length]
}

function makeChange(entity: string, seed: number): AuditChange[] {
    const fields = FIELDS[entity] ?? ["Field A", "Field B"];
    const n = (seed % 3) + 1;
    return Array.from({ length: n }, (_, k) => {
        const field = pick(fields, seed + k);
        return {
            field,
            oldValue: `old-${field.toLocaleLowerCase().replace(/\s+/g, "-")}-${seed}`,
            newValue: `new-${field.toLocaleLowerCase().replace(/\s+/g, "-")}-${seed + 1}`,
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
        rows.push({
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
            changes: action ===2 || action === 1? makeChange(ent.logical, i) : []
        });
    }
    return rows;
}