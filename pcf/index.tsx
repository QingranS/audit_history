import * as React from "react";
import {AuditGrid} from "../src/hooks/AuditGrid"
import { DataverseAuditService } from "./dataverseAuditService";

export class AuditHistory
  implements ComponentFramework.ReactControl<IInputs, IOutputs>
{
  private notifyOutputChanged: () => void = () => {};

  public init(
    context: ComponentFramework.Context<IInputs>,
    notifyOutputChanged: () => void,
  ): void {
    this.notifyOutputChanged = notifyOutputChanged;
    void context;
  }

  public updateView(
    context: ComponentFramework.Context<IInputs>,
  ): React.ReactElement {
    const service = new DataverseAuditService(context.webAPI);
    return React.createElement(AuditGrid, { service, title: "Audit history" });
  }

  public getOutputs(): IOutputs {
    return {};
  }

  public destroy(): void {
    // React virtual controls are unmounted by the framework.
  }
}

// These interfaces are generated from ControlManifest.Input.xml by pcf-scripts.
// Declared here only so this reference file is self-contained.
interface IInputs {}
interface IOutputs {}