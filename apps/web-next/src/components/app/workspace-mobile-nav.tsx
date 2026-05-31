"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { primaryNavigation } from "@/lib/domain/navigation";
import { cn } from "@/lib/utils";

export function WorkspaceMobileNav() {
  const pathname = usePathname();
  const items = primaryNavigation.filter((item) => item.enabled && item.href).slice(0, 4);

  return (
    <div className="sticky bottom-0 z-20 border-t border-border/70 bg-background/95 p-3 backdrop-blur md:hidden">
      <nav className="grid grid-cols-4 gap-2">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.title}
              href={item.href!}
              className={cn(
                "flex flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-medium text-muted-foreground transition-colors",
                active && "bg-card text-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.06)]",
              )}
            >
              <item.icon className="size-4" />
              <span>{item.title}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
