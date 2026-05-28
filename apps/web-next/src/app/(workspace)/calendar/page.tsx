import { CalendarReferenceSection } from "@/components/trading/calendar";
import { getWorkspaceState } from "@/lib/data/workspace-source";

export default async function CalendarPage() {
  const workspace = await getWorkspaceState();

  return <CalendarReferenceSection workspace={workspace} />;
}
