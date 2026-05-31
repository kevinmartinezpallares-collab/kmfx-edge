import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "KMFX Edge",
  description: "Panel operativo para trading, riesgo, cuentas y portfolio.",
};

export default function HomePage() {
  redirect("/dashboard");
}
