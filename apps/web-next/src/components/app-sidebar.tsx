"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { LogoLockup } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@/components/ui/sidebar";
import { AppSearch } from "@/components/app-search";
import { navGroups } from "@/components/app-shared";
import { CustomTrigger } from "@/components/custom-trigger";
import { LatestChange } from "@/components/latest-change";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { SettingsIcon } from "lucide-react";

export function AppSidebar() {
	const pathname = usePathname();

	return (
		<Sidebar
			className={cn(
				"*:data-[slot=sidebar-inner]:bg-background",
				"transition-[left,right,top,width] group-data-[collapsible=offcanvas]:top-[calc(var(--app-header-height)*0.5)]"
			)}
			collapsible="offcanvas"
			variant="sidebar"
		>
			<SidebarHeader className="h-(--app-header-height,3rem) flex-row items-center justify-between">
				<Button
					variant="ghost"
					render={<Link aria-label="Ir al panel de KMFX Edge" href="/dashboard" />}
					nativeButton={false}
				>
					<LogoLockup markClassName="size-7 rounded-lg" wordmarkClassName="text-sm" priority />
				</Button>
				<CustomTrigger place="sidebar" />
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<AppSearch />
				</SidebarGroup>
				{navGroups.map((group) => (
					<SidebarGroup key={group.label}>
						<SidebarGroupLabel className="group-data-[collapsible=icon]:pointer-events-none">
							{group.label}
						</SidebarGroupLabel>
						<SidebarMenu>
							{group.items.map((item) => (
								<SidebarMenuItem key={item.title}>
									{item.path && !item.disabled ? (
										<SidebarMenuButton isActive={pathname === item.path} tooltip={item.title} render={<Link href={item.path} />}>{item.icon}<span>{item.title}</span></SidebarMenuButton>
									) : (
										<SidebarMenuButton disabled tooltip={`${item.title} próximamente`}>
											{item.icon}
											<span>{item.title}</span>
										</SidebarMenuButton>
									)}
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroup>
				))}
			</SidebarContent>
			<SidebarFooter className="px-4">
				<LatestChange />
				<div className="flex items-center pt-4 pb-2">
					<ThemeSwitcher />
					<Button className="text-muted-foreground" size="icon-sm" variant="ghost" render={<Link aria-label="Settings" href="/dashboard" />} nativeButton={false}><SettingsIcon
                    							/></Button>
				</div>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
