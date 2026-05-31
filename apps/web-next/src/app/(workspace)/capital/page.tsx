import type { Metadata } from "next";
import { CapitalReferenceSection } from "@/components/trading/capital";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

export const metadata: Metadata = {
  title: "Portfolio / KMFX Edge",
  description: "Revisa capital, cuentas fondeadas y asignación operativa en KMFX Edge.",
};

type WorkspacePageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

export default async function CapitalPage({ searchParams }: WorkspacePageProps) {
  const workspace = await getWorkspaceStateForSearchParams(searchParams);

  return <CapitalReferenceSection workspace={workspace} />;
}
