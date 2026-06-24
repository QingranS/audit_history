// src/pages/testing_page.tsx
import React, { useEffect, useState } from 'react';
import { type AuditRecord, AuditTimeline } from './audit-history-newlook';

/* ------------------------------------------------------------------- */
/*   Helpers – Power Apps context & URL query extraction          */
/* ------------------------------------------------------------------- */

/** Get the Power Apps form context if the host injected it. */
const getPowerAppsContext = (): any => (window as any).dynamicsContext ?? null;

/** Parse entityName & recordId from the fragment part of the URL. */
const readHashParams = (): { entityName: string | null; recordId: string | null } => {
  const hash = window.location.hash; // e.g. "#/audit?entityName=account&recordId=..."
  const qIndex = hash.indexOf('?');
  if (qIndex === -1) return { entityName: null, recordId: null };

  const params = new URLSearchParams(hash.slice(qIndex + 1));
  return {
    entityName: params.get('entityName'),
    recordId: params.get('recordId'),
  };
};

/* ------------------------------------------------------------------- */
/*   Default context – used only when running locally (no form)    */
/* ------------------------------------------------------------------- */

const DEFAULT_CONTEXT = {
  page: undefined as any,
  webAPI: {
    async retrieveMultipleRecords(
      entityName: string,
      query: string
    ): Promise<{ entities: AuditRecord[] }> {
      // 1. Remove the hardcoded CRM URL. Use a relative path.
      // The plugin proxies anything starting with /api/data/ to Dataverse
      const res = await fetch(`/api/data/v9.2/${entityName}${query}`, {
        headers: {
          // 2. Remove the Authorization header completely.
          // The proxy server injects your active session tokens automatically.
          Accept: 'application/json',
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0',
        },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { entities: data.value };
    },
  },
};

interface AuditPageProps {
  /** Optional – a real Power Apps context can be passed in. */
  context?: any;
}

const AuditPage: React.FC<AuditPageProps> = ({ context }) => {
  /* Prefer the passed context → Power Apps context → the local fallback. */
  const ctx = context ?? getPowerAppsContext() ?? DEFAULT_CONTEXT;

  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  const { entityName: ctxEntity, recordId: ctxId } = ctx.page ?? {
    entityTypeName: null,
    entityId: null,
  };

  const { entityName: urlEntity, recordId: urlId } = readHashParams();

  const entityName = ctxEntity ?? urlEntity;
  const recordId = ctxId ?? urlId;

  /* --------------------------------------------------------------- */
  /*  Fetch audit history                                         */
  /* --------------------------------------------------------------- */
  useEffect(() => {
    async function fetchHistory() {
      if (!recordId || !entityName) {
        setError(
          'Could not resolve current record information from the form context.'
        );
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const filter = `_objectid_value eq ${recordId}`;
        const select = 'auditid,createdon,operation,changedata,_userid_value';
        const order = 'createdon desc';

        const response = await ctx.webAPI.retrieveMultipleRecords(
          'audit',
          `?$select=${select}&$filter=${filter}&$orderby=${order}`
        );

        if (response?.entities) setAudits(response.entities as AuditRecord[]);
      } catch (err: any) {
        console.error('Failed fetching audit data:', err);
        setError(
          err.message ||
            'An unexpected error occurred while communicating with Dataverse.'
        );
      } finally {
        setLoading(false);
      }
    }

    fetchHistory();
  }, [entityName, recordId, ctx]);

  /* --------------------------------------------------------------- */
  /*   Render                                                        */
  /* --------------------------------------------------------------- */
  if (loading) {
    return (
      <div className="audit-page-loading">
        <span className="spinner">⏳</span> Loading audit trails…
      </div>
    );
  }

  if (error) {
    return (
      <div className="audit-page-error">
        <strong>Data Retrieval Error:</strong> {error}
      </div>
    );
  }

  return (
    <div className="audit-page-container">
      <AuditTimeline audits={audits} />
    </div>
  );
};

export default AuditPage;