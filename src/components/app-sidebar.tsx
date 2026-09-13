import {
	Avatar,
	AvatarFallback,
	AvatarImage,
	Button,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandPalette,
	Sidebar,
	SidebarFooter,
	SidebarHeader,
	SidebarIconItem,
	SidebarItem,
	SidebarNav,
	SidebarPartition,
	SidebarSearch,
	SidebarUser,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@nocoo/basalt";
import { PanelLeft, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { sessionInitials } from "../viewmodels/session-view-model";
import { APP_VERSION } from "./app-version";
import { APP_NAME, BRAND_MARK_SRC } from "./brand";
import { NAV_ITEMS } from "./navigation";

export interface AppSidebarProps {
	collapsed: boolean;
	enableShortcut?: boolean;
	onToggle: () => void;
	onNavigate?: () => void;
	userName: string;
	userEmail?: string;
	userAvatar?: string | null;
}

export function AppSidebar({
	collapsed,
	enableShortcut = true,
	onToggle,
	onNavigate,
	userName,
	userEmail,
	userAvatar,
}: AppSidebarProps) {
	const location = useLocation();
	const routerNavigate = useNavigate();
	const [searchOpen, setSearchOpen] = useState(false);

	useEffect(() => {
		if (!enableShortcut) {
			return;
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key === "k") {
				event.preventDefault();
				setSearchOpen((open) => !open);
			}
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [enableShortcut]);

	const navigate = useCallback(
		(href: string) => {
			setSearchOpen(false);
			routerNavigate(href);
			onNavigate?.();
		},
		[onNavigate, routerNavigate],
	);

	const avatar = (
		<Avatar className="h-9 w-9 shrink-0">
			{userAvatar ? <AvatarImage src={userAvatar} alt={userName} /> : null}
			<AvatarFallback>{sessionInitials(userName)}</AvatarFallback>
		</Avatar>
	);

	return (
		<Sidebar collapsed={collapsed} aria-label="主导航">
			{collapsed ? (
				<>
					<SidebarHeader>
						<img
							src={BRAND_MARK_SRC}
							alt={APP_NAME}
							width={24}
							height={24}
							data-sidebar-logo=""
							className="h-6 w-6 shrink-0"
						/>
					</SidebarHeader>
					<Button
						variant="ghost"
						size="icon"
						className="mb-1 self-center"
						onClick={onToggle}
						aria-label="展开侧栏"
					>
						<PanelLeft aria-hidden="true" />
					</Button>
					<Tooltip delayDuration={0}>
						<TooltipTrigger asChild>
							<SidebarIconItem
								className="mb-2 self-center"
								onClick={() => setSearchOpen(true)}
								aria-label="搜索 (⌘K)"
							>
								<Search className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
							</SidebarIconItem>
						</TooltipTrigger>
						<TooltipContent side="right" sideOffset={8}>
							搜索 (⌘K)
						</TooltipContent>
					</Tooltip>
					<SidebarNav className="w-full items-center gap-1 pt-1">
						{NAV_ITEMS.map((item) => (
							<Tooltip key={item.href} delayDuration={0}>
								<TooltipTrigger asChild>
									<SidebarIconItem
										active={location.pathname === item.href}
										aria-label={item.label}
										className="self-center"
										onClick={() => navigate(item.href)}
									>
										<item.icon className="h-4 w-4" strokeWidth={1.5} />
									</SidebarIconItem>
								</TooltipTrigger>
								<TooltipContent side="right" sideOffset={8}>
									{item.label}
								</TooltipContent>
							</Tooltip>
						))}
					</SidebarNav>
					<SidebarFooter className="flex w-full justify-center px-0">
						<Tooltip delayDuration={0}>
							<TooltipTrigger asChild>
								<span className="inline-flex">{avatar}</span>
							</TooltipTrigger>
							<TooltipContent side="right" sideOffset={8}>
								{userName}
							</TooltipContent>
						</Tooltip>
					</SidebarFooter>
				</>
			) : (
				<>
					<SidebarHeader>
						<div className="flex w-full items-center justify-between">
							<div className="flex min-w-0 items-center gap-3">
								<img
									src={BRAND_MARK_SRC}
									alt=""
									width={24}
									height={24}
									data-sidebar-logo=""
									className="h-6 w-6 shrink-0"
								/>
								<span className="truncate text-lg font-semibold text-basalt-foreground md:text-xl">
									{APP_NAME}
								</span>
								<span className="shrink-0 rounded-md bg-basalt-secondary px-1.5 py-0.5 text-[10px] leading-none font-medium text-basalt-muted-foreground">
									v{APP_VERSION}
								</span>
							</div>
							<Button
								variant="ghost"
								size="icon"
								className="h-7 w-7 shrink-0"
								onClick={onToggle}
								aria-label="收起侧栏"
							>
								<PanelLeft aria-hidden="true" />
							</Button>
						</div>
					</SidebarHeader>
					<div className="px-3 pb-1">
						<SidebarSearch onClick={() => setSearchOpen(true)}>搜索</SidebarSearch>
					</div>
					<SidebarNav className="pt-1">
						<SidebarPartition>编年史</SidebarPartition>
						<div className="flex flex-col gap-0.5 px-3">
							{NAV_ITEMS.map((item) => (
								<SidebarItem
									key={item.href}
									active={location.pathname === item.href}
									onClick={() => navigate(item.href)}
								>
									<item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
									<span className="flex-1 truncate text-left">{item.label}</span>
								</SidebarItem>
							))}
						</div>
					</SidebarNav>
					<SidebarFooter>
						<SidebarUser name={userName} email={userEmail} avatar={avatar} />
					</SidebarFooter>
				</>
			)}

			<CommandPalette open={searchOpen} onOpenChange={setSearchOpen}>
				<CommandInput placeholder="搜索页面…" />
				<CommandList>
					<CommandEmpty>没有匹配的页面</CommandEmpty>
					<CommandGroup heading="编年史">
						{NAV_ITEMS.map((item) => (
							<CommandItem key={item.href} value={item.label} onSelect={() => navigate(item.href)}>
								<item.icon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
								<span>{item.label}</span>
							</CommandItem>
						))}
					</CommandGroup>
				</CommandList>
			</CommandPalette>
		</Sidebar>
	);
}
