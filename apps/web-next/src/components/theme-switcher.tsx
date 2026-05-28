"use client";

import { Laptop, Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/app/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const themeOptions = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Oscuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Laptop },
] as const;

export function ThemeSwitcher() {
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className="relative"
            variant="outline"
            size="icon"
            aria-label="Cambiar modo claro u oscuro"
          />
        }
      >
        <Sun
          className="absolute rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0"
          data-icon="inline-start"
        />
        <Moon
          className="absolute rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100"
          data-icon="inline-start"
        />
        <span className="sr-only">Cambiar modo claro u oscuro</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Modo de interfaz</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {themeOptions.map((option) => {
            const Icon = option.icon;

            return (
              <DropdownMenuItem
                key={option.value}
                onClick={() => setTheme(option.value)}
              >
                <Icon data-icon="inline-start" />
                <span>{option.label}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
