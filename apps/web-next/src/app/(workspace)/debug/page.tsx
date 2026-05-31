import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RoadmapScaffoldSection } from "@/components/trading/debug";

export const metadata: Metadata = {
  title: "Debug / KMFX Edge",
  description: "Ruta interna de diagnóstico para el workspace de KMFX Edge.",
};

export default function DebugPage() {
  if (process.env.KMFX_ENABLE_DEBUG_ROUTE !== "1") {
    notFound();
  }

  return (
    <RoadmapScaffoldSection
      title="Debug"
      badgeLabel="Admin-only"
      description="Ruta reservada para diagnóstico interno. Por defecto devuelve 404 y solo se habilita con KMFX_ENABLE_DEBUG_ROUTE=1."
      bullets={[
        "gating por variable de entorno server-side",
        "bridge inspection y utilidades internas quedan para fase admin",
        "sin visibilidad pública por defecto ni enlaces en sidebar",
      ]}
    />
  );
}
