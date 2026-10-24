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
	SidebarGroup,
	SidebarHeader,
	SidebarIconItem,
	SidebarItem,
	SidebarNav,
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
import { NAV_GROUPS, type NavGroup, SETTINGS_GROUP_ID } from "./navigation";

const MAIN_GROUPS = NAV_GROUPS.filter((group) => group.id !== SETTINGS_GROUP_ID);
const SETTINGS_GROUP = NAV_GROUPS.find((group) => group.id === SETTINGS_GROUP_ID);

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
	const pathname = location.pathname;

	const collapsedIcons = (groups: NavGroup[]) =>
		groups.flatMap((group) =>
			group.items.map((item) => (
				<Tooltip key={item.href} delayDuration={0}>
					<TooltipTrigger asChild>
						<SidebarIconItem
							active={pathname === item.href}
							aria-label={item.label}
							onClick={() => navigate(item.href)}
						>
							<item.icon className="h-4 w-4" strokeWidth={1.5} />
						</SidebarIconItem>
					</TooltipTrigger>
					<TooltipContent side="right" sideOffset={8}>
						{item.label}
					</TooltipContent>
				</Tooltip>
			)),
		);

	const expandedGroups = (groups: NavGroup[]) =>
		groups.map((group) => (
			<SidebarGroup key={group.id} label={group.label}>
				{group.items.map((item) => (
					<SidebarItem
						key={item.href}
						active={pathname === item.href}
						onClick={() => navigate(item.href)}
					>
						<item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
						<span className="flex-1 truncate text-left">{item.label}</span>
					</SidebarItem>
				))}
			</SidebarGroup>
		));

	return (
		<Sidebar collapsed={collapsed} aria-label="主导航">
			<SidebarHeader>
				<div
					className={
						collapsed
							? "flex w-full justify-center"
							: "flex w-full min-w-0 items-center justify-between"
					}
				>
					<div
						className={
							collapsed ? "flex items-center" : "flex min-w-0 items-center gap-basalt-space-lg"
						}
					>
						<img
							src={BRAND_MARK_SRC}
							alt={APP_NAME}
							width={24}
							height={24}
							data-sidebar-logo=""
							className="h-6 w-6 shrink-0"
						/>
						{!collapsed ? (
							<>
								<span className="truncate text-lg font-semibold text-basalt-foreground md:text-xl">
									{APP_NAME}
								</span>
								<span className="shrink-0 rounded-md bg-basalt-secondary px-basalt-space-md py-basalt-space-xs text-[10px] leading-none font-medium text-basalt-muted-foreground">
									v{APP_VERSION}
								</span>
							</>
						) : null}
					</div>
					{!collapsed ? (
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7 shrink-0"
							onClick={onToggle}
							aria-label="收起侧栏"
							aria-expanded
						>
							<PanelLeft aria-hidden="true" />
						</Button>
					) : null}
				</div>
			</SidebarHeader>

			{collapsed ? (
				<>
					<Button
						variant="ghost"
						size="icon"
						className="mb-basalt-space-sm self-center"
						onClick={onToggle}
						aria-label="展开侧栏"
						aria-expanded={false}
					>
						<PanelLeft aria-hidden="true" />
					</Button>
					<SidebarNav aria-label="页面">
						<Tooltip delayDuration={0}>
							<TooltipTrigger asChild>
								<SidebarIconItem onClick={() => setSearchOpen(true)} aria-label="搜索 (⌘K)">
									<Search className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
								</SidebarIconItem>
							</TooltipTrigger>
							<TooltipContent side="right" sideOffset={8}>
								搜索 (⌘K)
							</TooltipContent>
						</Tooltip>
						{collapsedIcons(MAIN_GROUPS)}
					</SidebarNav>
					{SETTINGS_GROUP ? (
						<div className="mt-auto">
							<SidebarNav aria-label="设置">{collapsedIcons([SETTINGS_GROUP])}</SidebarNav>
						</div>
					) : null}
				</>
			) : (
				<>
					<div className="px-basalt-nav-inset">
						<SidebarSearch
							className="[&_span]:text-basalt-foreground"
							onClick={() => setSearchOpen(true)}
						>
							搜索
						</SidebarSearch>
					</div>
					<SidebarNav aria-label="页面">{expandedGroups(MAIN_GROUPS)}</SidebarNav>
					{SETTINGS_GROUP ? (
						<div className="mt-auto">
							<SidebarNav aria-label="设置">{expandedGroups([SETTINGS_GROUP])}</SidebarNav>
						</div>
					) : null}
				</>
			)}
			<SidebarFooter>
				{collapsed ? (
					<Tooltip delayDuration={0}>
						<TooltipTrigger asChild>
							<span className="inline-flex self-center">{avatar}</span>
						</TooltipTrigger>
						<TooltipContent side="right" sideOffset={8}>
							{userName}
						</TooltipContent>
					</Tooltip>
				) : (
					<SidebarUser
						name={userName}
						email={userEmail}
						avatar={
							<Tooltip delayDuration={0}>
								<TooltipTrigger asChild>
									<span className="inline-flex shrink-0">{avatar}</span>
								</TooltipTrigger>
								<TooltipContent side="right" sideOffset={8}>
									{userName}
								</TooltipContent>
							</Tooltip>
						}
					/>
				)}
			</SidebarFooter>

			<CommandPalette open={searchOpen} onOpenChange={setSearchOpen}>
				<CommandInput placeholder="搜索页面…" />
				<CommandList>
					<CommandEmpty>没有匹配的页面</CommandEmpty>
					{NAV_GROUPS.map((group) => (
						<CommandGroup key={group.id} heading={group.label}>
							{group.items.map((item) => (
								<CommandItem
									key={item.href}
									value={`${group.label} ${item.label}`}
									onSelect={() => navigate(item.href)}
								>
									<item.icon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
									<span>{item.label}</span>
								</CommandItem>
							))}
						</CommandGroup>
					))}
				</CommandList>
			</CommandPalette>
		</Sidebar>
	);
}
