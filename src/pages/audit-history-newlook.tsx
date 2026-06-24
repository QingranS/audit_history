import React, { useMemo } from 'react';

export interface AuditRecord {
  auditid: string;
  createdon: string;
  operation: number;
  _userid_value: string;
  changedata?: Record<string, any>;
}

interface AuditTimelineProps {
  audits: AuditRecord[];
}

const operationLabel = (op: number): string => {
  switch (op) {
    case 1: return 'Created';
    case 2: return 'Updated';
    case 3: return 'Deleted';
    case 4: return 'Status Changed';
    default: return `Action (${op})`;
  }
};

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

export const AuditTimeline: React.FC<AuditTimelineProps> = ({ audits }) => {
  const hasData = Array.isArray(audits) && audits.length > 0;

  const rows = useMemo(() => {
    if (!hasData) return null;

    return audits.map((rec) => {
      const changedFields = rec.changedata
        ? Object.keys(rec.changedata)
        : [];

      return (
        <div key={rec.auditid} className="audit-row">
          <div className="audit-row__header">
            <span className="audit-row__operation">{operationLabel(rec.operation)}</span>
            <span className="audit-row__date">{formatDate(rec.createdon)}</span>
          </div>
          <div className="audit-row__user">
            Changed by user ID: <span className="audit-row__user-id">{rec._userid_value}</span>
          </div>
          {changedFields.length > 0 && (
            <div className="audit-row__changed-fields">
              <strong>Modified fields:</strong> {changedFields.join(', ')}
            </div>
          )}
        </div>
      );
    });
  }, [audits, hasData]);

  if (!hasData) {
    return <div className="audit-empty"><em>No audit history found.</em></div>;
  }

  return (
    <section className="audit-timeline">
      <h3 className="audit-timeline__title">Audit History Trail</h3>
      <div className="audit-timeline__list">{rows}</div>
    </section>
  );
};