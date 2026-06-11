"use client";

import * as React from "react";

import type { WorkspaceState } from "@/lib/contracts/workspace-state";

const WorkspaceContext = React.createContext<WorkspaceState | null>(null);

export function WorkspaceProvider({
  children,
  workspace,
}: {
  children: React.ReactNode;
  workspace: WorkspaceState;
}) {
  return (
    <WorkspaceContext.Provider value={workspace}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const workspace = React.useContext(WorkspaceContext);

  if (!workspace) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider");
  }

  return workspace;
}
