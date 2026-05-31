"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUpRightIcon,
  CommandIcon,
  SearchIcon,
  WalletCardsIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { primaryNavigation } from "@/lib/domain/navigation";

export function CommandEntry() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="hidden h-14 min-w-[26rem] justify-between rounded-3xl border-border/70 bg-card/70 px-5 text-lg text-muted-foreground md:flex"
        onClick={() => setOpen(true)}
      >
        <span className="flex items-center gap-2">
          <SearchIcon className="size-4" />
          Buscar rutas, símbolos o acciones
        </span>
        <span className="rounded-xl border border-border bg-background px-3 py-1 text-sm text-muted-foreground">
          ⌘K
        </span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        onClick={() => setOpen(true)}
      >
        <CommandIcon />
        <span className="sr-only">Abrir búsqueda</span>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Comandos KMFX"
        description="Navega por las secciones principales del panel."
      >
        <Command>
          <CommandInput placeholder="Ir a Panel, Insights o Cuentas..." />
          <CommandList>
            <CommandEmpty>No hay coincidencias todavía.</CommandEmpty>
            <CommandGroup heading="Operativa principal">
              {primaryNavigation.flatMap((item) => {
                if (!item.enabled || !item.href) return [];

                const href = item.href;

                return [
                  <CommandItem
                    key={item.title}
                    value={item.title}
                    onSelect={() => {
                      router.push(href);
                      setOpen(false);
                    }}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                    {pathname === href ? (
                      <CommandShortcut>Actual</CommandShortcut>
                    ) : (
                      <CommandShortcut>Ir</CommandShortcut>
                    )}
                  </CommandItem>,
                ];
              })}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Atajos próximos">
              <CommandItem disabled>
                <WalletCardsIcon />
                <span>Cambio rápido de cuenta</span>
                <CommandShortcut>Pronto</CommandShortcut>
              </CommandItem>
              <CommandItem disabled>
                <ArrowUpRightIcon />
                <span>Acceso directo a Playbooks y Review</span>
                <CommandShortcut>Pronto</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
