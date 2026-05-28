import { StudyReferenceSection } from "@/components/trading/system";
import { getWorkspaceState } from "@/lib/data/workspace-source";

export default async function StudyPage() {
  const workspace = await getWorkspaceState();

  return <StudyReferenceSection workspace={workspace} />;
}
