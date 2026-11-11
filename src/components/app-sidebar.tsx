import {
	Avatar,
	AvatarFallback,
	AvatarImage,
	Sidebar as BasaltSidebar,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandPalette,
	SidebarBrand,
	SidebarFooter,
	SidebarGroup,
	SidebarHeader,
	SidebarIconItem,
	SidebarItem,
	SidebarNav,
	SidebarProvider,
	SidebarSearch,
	SidebarToggle,
	SidebarUser,
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@nocoo/basalt";
import { useSidebar } from "@nocoo/basalt/components/sidebar";
import { Search } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type { Session } from "../models/types";
import { sessionInitials } from "../viewmodels/session-view-model";
import { APP_VERSION } from "./app-version";
import { APP_NAME, BRAND_MARK_SRC } from "./brand";
import { NAV_GROUPS, NAV_ITEMS, type NavGroup } from "./navigation";

const ACCESS_LOGOUT_URL = "/cdn-cgi/access/logout";
const SIDEBAR_COLLAPSED_KEY = "life.ai:sidebar-collapsed";
type SidebarCollapsedPreference = "false" | "true";

interface AppSidebarBodyProps {
	variant?: "desktop" | "mobile";
	enableShortcut?: boolean;
	onNavigate?: () => void;
	onDismiss?: () => void;
	userName: string;
	userEmail?: string;
	userAvatar?: string | null;
	sessionMode: Session["mode"] | null;
}

export type AppSidebarProps = AppSidebarBodyProps & {
	ariaLabel: string;
};

export function PersistedSidebarProvider({ children }: { children: ReactNode }) {
	const [stored, setStored] = useState<SidebarCollapsedPreference>(() => {
		if (typeof window === "undefined") {
			return "false";
		}
		const value = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
		return value === "true" || value === "false" ? value : "false";
	});
	const collapsed = stored === "true";
	const onCollapsedChange = useCallback((next: boolean) => {
		const preference: SidebarCollapsedPreference = next ? "true" : "false";
		setStored(preference);
		localStorage.setItem(SIDEBAR_COLLAPSED_KEY, preference);
	}, []);

	return (
		<SidebarProvider collapsed={collapsed} onCollapsedChange={onCollapsedChange} defaultWidth={260}>
			{children}
		</SidebarProvider>
	);
}

function AppSidebarBody({
	variant,
	enableShortcut = true,
	onNavigate,
	onDismiss,
	userName,
	userEmail,
	userAvatar,
	sessionMode,
}: AppSidebarBodyProps) {
	const location = useLocation();
	const routerNavigate = useNavigate();
	const [searchOpen, setSearchOpen] = useState(false);
	const { collapsed, peek, peeking } = useSidebar();
	const railCollapsed = collapsed && !(peek && peeking);
	const pathname = location.pathname;

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
		<Avatar>
			{userAvatar ? <AvatarImage src={userAvatar} alt={userName} /> : null}
			<AvatarFallback>{sessionInitials(userName)}</AvatarFallback>
		</Avatar>
	);

	const renderGroup = (group: NavGroup) => (
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
	);

	return (
		<>
			<SidebarHeader>
				<SidebarBrand
					logo={<img src={BRAND_MARK_SRC} alt={APP_NAME} width={24} height={24} />}
					name={APP_NAME}
					version={`v${APP_VERSION}`}
					action={
						variant === "mobile" ? (
							<SidebarToggle
								mode="dismiss"
								dismissLabel="关闭导航菜单"
								{...(onDismiss ? { onDismiss } : {})}
							/>
						) : (
							<SidebarToggle expandLabel="展开侧栏" collapseLabel="收起侧栏" />
						)
					}
				/>
			</SidebarHeader>
			<SidebarNav aria-label="页面">
				{!railCollapsed ? (
					<SidebarSearch
						onClick={(event) => {
							event.preventDefault();
							setSearchOpen(true);
						}}
					>
						搜索
					</SidebarSearch>
				) : null}
				{railCollapsed
					? [
							<Tooltip key="search" delayDuration={0}>
								<TooltipTrigger asChild>
									<SidebarIconItem onClick={() => setSearchOpen(true)} aria-label="搜索 (⌘K)">
										<Search className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
									</SidebarIconItem>
								</TooltipTrigger>
								<TooltipContent side="right" sideOffset={8}>
									搜索 (⌘K)
								</TooltipContent>
							</Tooltip>,
							...NAV_ITEMS.map((item) => (
								<Tooltip key={item.href} delayDuration={0}>
									<TooltipTrigger asChild>
										<SidebarIconItem
											active={pathname === item.href}
											aria-label={item.label}
											onClick={() => navigate(item.href)}
										>
											<item.icon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
										</SidebarIconItem>
									</TooltipTrigger>
									<TooltipContent side="right" sideOffset={8}>
										{item.label}
									</TooltipContent>
								</Tooltip>
							)),
						]
					: NAV_GROUPS.map(renderGroup)}
			</SidebarNav>
			<SidebarFooter>
				<SidebarUser
					name={userName}
					email={userEmail}
					avatar={avatar}
					tooltip={userName}
					{...(sessionMode === "access"
						? { signOutHref: ACCESS_LOGOUT_URL, signOutLabel: "退出登录" }
						: {})}
				/>
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
		</>
	);
}

export function AppSidebar({ ariaLabel, variant = "desktop", ...bodyProps }: AppSidebarProps) {
	return (
		<TooltipProvider delayDuration={0}>
			<BasaltSidebar aria-label={ariaLabel} resizable={false}>
				<AppSidebarBody variant={variant} {...bodyProps} />
			</BasaltSidebar>
		</TooltipProvider>
	);
}
