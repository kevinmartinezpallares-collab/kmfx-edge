import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StrategyLabSection } from "@/components/trading/strategy-lab";
import { isAdminEmailAllowed, isGeneticLabEnabled } from "@/lib/auth/admin-access";
import {
  hasSupabasePublicConfig,
  isSupabaseAuthEnabled,
} from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Strategy Lab / KMFX Edge",
  description: "Laboratorio interno de exploración genética de estrategias.",
};

export default async function StrategyLabPage() {
  if (
    !isGeneticLabEnabled() ||
    !isSupabaseAuthEnabled() ||
    !hasSupabasePublicConfig()
  ) {
    notFound();
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();

  if (!isAdminEmailAllowed(data.user?.email)) {
    notFound();
  }

  return <StrategyLabSection />;
}
