"use client";

import { cn } from "@/lib/utils";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

const latestChange = {
	title: "Panel en revisión",
	description:
		"Base Next preparada con navegación, panel y secciones operativas en modo lectura segura.",
	url: "/dashboard",
} as const;

export function LatestChange() {
	const [isOpen, setIsOpen] = useState(true);

	if (!isOpen) {
		return null;
	}

	return (
		<div
			className={cn(
				"rounded-lg group/latest-change z-20 size-full justify-center border bg-background"
			)}
		>
			<div className="relative flex size-full flex-col gap-1.5 overflow-hidden px-3 pt-4 pb-1">
				<p className="font-medium text-xs">{latestChange.title}</p>
				<span className="text-[10px] text-muted-foreground">
					{latestChange.description}
				</span>
				<Button
					aria-label="Ver panel"
					className="w-max px-0 font-light text-xs"
					size="sm"
					variant="link"
					render={<a href={latestChange.url} aria-label="Ver panel" />}
					nativeButton={false}
				>
					Ver panel
				</Button>
				<Button
					aria-label="Cerrar aviso de cambio"
					className="absolute top-2 right-2 z-10 size-6 rounded-full opacity-0 transition-opacity group-hover/latest-change:opacity-100"
					onClick={() => setIsOpen(false)}
					size="icon-sm"
					variant="secondary"
				>
					<XIcon className="size-3.5 text-muted-foreground" />
				</Button>
			</div>
		</div>
	);
}
