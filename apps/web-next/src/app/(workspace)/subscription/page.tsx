import { SubscriptionReferenceSection } from "@/components/trading/settings";
import {
  getWorkspaceStateForSearchParams,
  type WorkspaceSearchParams,
} from "@/lib/data/workspace-source";

type WorkspacePageProps = {
  searchParams?: Promise<WorkspaceSearchParams>;
};

function firstSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SubscriptionPage({ searchParams }: WorkspacePageProps) {
  const resolvedSearchParams = await searchParams;
  const workspace = await getWorkspaceStateForSearchParams(resolvedSearchParams);
  const welcome = firstSearchParamValue(resolvedSearchParams?.welcome) === "1";

  return <SubscriptionReferenceSection welcome={welcome} workspace={workspace} />;
}
