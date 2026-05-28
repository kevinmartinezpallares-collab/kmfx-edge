"use client";

import Link from "next/link";
import {
  ArrowLeftIcon,
  AtSignIcon,
  CalendarDaysIcon,
  ChartNoAxesCombinedIcon,
  ChevronRightIcon,
  Layers3Icon,
  ShieldCheckIcon,
} from "lucide-react";

import { AuthDivider } from "@/components/auth-divider";
import { FloatingPaths } from "@/components/floating-paths";
import { AppleIcon } from "@/components/icons/apple-icon";
import { GithubIcon } from "@/components/icons/github-icon";
import { GoogleIcon } from "@/components/icons/google-icon";
import { LogoMark, LogoWordmark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";

const accessHighlights = [
  {
    icon: ChartNoAxesCombinedIcon,
    title: "Panel operativo",
    description: "Capital, PnL, win rate, drawdown y cuenta activa en una lectura rápida.",
  },
  {
    icon: Layers3Icon,
    title: "Multi-cuenta",
    description: "Cuentas reales, fondeo y Darwinex preparadas en un mismo entorno.",
  },
  {
    icon: ShieldCheckIcon,
    title: "RiskGuard",
    description: "Reglas y límites listos para evolucionar hacia protección operativa.",
  },
  {
    icon: CalendarDaysIcon,
    title: "Calendario",
    description: "Sesiones, días clave y eventos macro cerca de la operativa.",
  },
];

export function AuthPage() {
  return (
    <main className="relative min-h-svh overflow-hidden bg-background text-foreground lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden min-h-svh overflow-hidden border-r border-border/70 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--muted))_0,transparent_32%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted)/0.28))] lg:flex">
        <FloatingPaths position={1} />
        <FloatingPaths position={-1} />

        <div className="relative z-10 flex min-h-svh w-full flex-col justify-between p-10 xl:p-12">
          <div className="flex items-center gap-3">
            <LogoMark
              className="size-11 rounded-full ring-1 ring-border shadow-[0_20px_80px_rgba(0,0,0,0.25)]"
              priority
              sizes="44px"
            />
            <div className="flex flex-col">
              <LogoWordmark className="text-lg" />
            </div>
          </div>

          <div className="max-w-2xl">
            <p className="mb-4 text-sm font-medium tracking-[0.28em] text-muted-foreground uppercase">
              Acceso seguro
            </p>
            <h1 className="max-w-xl text-4xl leading-tight font-semibold tracking-tight text-balance xl:text-6xl">
              Entra, revisa tu cuenta y decide sin ruido.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground xl:text-lg">
              KMFX centraliza cuenta, calendario, trades, portfolio e insights para que
              el trader vea lo importante antes de tocar el botón de entrada.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-border bg-border/70">
            {accessHighlights.map((item) => (
              <div
                className="flex min-h-36 flex-col justify-between bg-card/90 p-5"
                key={item.title}
              >
                <item.icon className="size-5 text-muted-foreground" />
                <div className="flex flex-col gap-1.5">
                  <h2 className="text-sm font-semibold">{item.title}</h2>
                  <p className="text-sm leading-5 text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative flex min-h-svh items-center justify-center px-5 py-10 sm:px-8 lg:px-10">
        <Button
          className="absolute top-5 left-5 text-muted-foreground"
          render={<Link href="/dashboard" />}
          nativeButton={false}
          variant="ghost"
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Volver al panel
        </Button>

        <div className="flex w-full max-w-md flex-col gap-8">
          <div className="flex flex-col gap-3 text-center">
            <LogoMark
              className="mx-auto size-12 rounded-full ring-1 ring-border"
              priority
              sizes="48px"
            />
            <div className="flex flex-col gap-2">
              <h2 className="text-3xl font-semibold tracking-tight">Inicia sesión</h2>
              <p className="text-sm text-muted-foreground">
                Accede a tu panel de trading y gestión de cuentas.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button type="button" variant="outline">
              <GoogleIcon data-icon="inline-start" />
              Continuar con Google
            </Button>
            <Button type="button" variant="outline">
              <AppleIcon data-icon="inline-start" />
              Continuar con Apple
            </Button>
            <Button type="button" variant="outline">
              <GithubIcon data-icon="inline-start" />
              Continuar con GitHub
            </Button>
          </div>

          <AuthDivider>o</AuthDivider>

          <form className="flex flex-col gap-5">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <InputGroup className="h-10 rounded-xl">
                  <InputGroupAddon align="inline-start">
                    <AtSignIcon className="size-4" />
                  </InputGroupAddon>
                  <InputGroupInput
                    autoComplete="email"
                    id="email"
                    placeholder="tu@email.com"
                    type="email"
                  />
                </InputGroup>
                <FieldDescription>
                  Usaremos este email para validar el acceso a tu cuenta.
                </FieldDescription>
              </Field>
            </FieldGroup>

            <Button className="h-10 rounded-xl" type="button">
              Continuar con email
              <ChevronRightIcon data-icon="inline-end" />
            </Button>
          </form>

          <p className="text-center text-sm leading-6 text-muted-foreground">
            Al continuar aceptas los términos de KMFX Edge y la política de privacidad.
          </p>
        </div>
      </section>
    </main>
  );
}
