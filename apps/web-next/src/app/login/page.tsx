import type { Metadata } from "next";

import { AuthPage } from "@/components/auth/auth-page";

export const metadata: Metadata = {
  title: "Iniciar sesión / KMFX Edge",
  description: "Acceso al panel de trading de KMFX Edge.",
};

export default function LoginPage() {
  return <AuthPage />;
}
