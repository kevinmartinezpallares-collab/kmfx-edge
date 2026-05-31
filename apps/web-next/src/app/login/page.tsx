import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthPage } from "@/components/auth/auth-page";

export const metadata: Metadata = {
  title: "Iniciar sesión / KMFX Edge",
  description: "Acceso al panel de trading de KMFX Edge.",
};

type LoginPageProps = {
  searchParams?: Promise<{
    next?: string | string[];
  }>;
};

function resolveLoginNextPath(value: string | string[] | undefined) {
  const nextPath = Array.isArray(value) ? value[0] : value;

  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/dashboard";
  }

  return nextPath;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = resolveLoginNextPath(params?.next);

  return (
    <Suspense fallback={null}>
      <AuthPage nextPath={nextPath} />
    </Suspense>
  );
}
