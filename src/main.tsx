import React from "react";
import ReactDOM from "react-dom/client";
import { AuditGrid } from "./hooks/AuditGrid";
import { MockAuditService } from "./components/service/mockAuditService";

const service = new MockAuditService(64);

const styles: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f5f5f5",
  padding: "24px",
  boxSizing: "border-box",
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div style={styles}>
      <AuditGrid service={service} title="Audit history — local harness" />
    </div>
  </React.StrictMode>,
);