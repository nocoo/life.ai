import { ContentIsland, SidebarDrawer } from "@nocoo/basalt";
import { AppHeader, AppHeaderMenuButton, ProjectLinks } from "@nocoo/basalt/components/app-header";
import { AppMain, AppShell, AppSkipLink } from "@nocoo/basalt/components/app-shell";
import { Banner } from "@nocoo/basalt/components/banner";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { LoadingScreen } from "@nocoo/basalt/components/loading-screen";
import { ThemeToggle } from "@nocoo/basalt/components/theme-toggle";
import { Suspense, useEffect, useId, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { useStore } from "zustand";
import { generalSettingsStore } from "../viewmodels/general-settings-view-model";
import {
	sessionAvatarUrl,
	sessionDisplayName,
	sessionSecondaryText,
	sessionStore,
} from "../viewmodels/session-view-model";
import { AccentControl } from "./accent-control";
import { AppSidebar, PersistedSidebarProvider } from "./app-sidebar";
import { APP_NAME, BRAND_MARK_SRC } from "./brand";
import { routeMeta } from "./navigation";
import { PageFallback } from "./page-fallback";
import { useIsMobile } from "./use-is-mobile";

export function AppFrame() {
	const [mobileOpen, setMobileOpen] = useState(false);
	const isMobile = useIsMobile();
	const location = useLocation();
	const pathname = location.pathname;
	const menuButton = useRef<HTMLButtonElement>(null);
	const drawerId = useId();
	const session = useStore(sessionStore, (state) => state.session);
	const status = useStore(sessionStore, (state) => state.status);
	const error = useStore(sessionStore, (state) => state.error);
	const expired = useStore(sessionStore, (state) => state.expired);
	const meta = routeMeta(pathname);
	const userName = sessionDisplayName(session);
	const userEmail = sessionSecondaryText(session);
	const userAvatar = sessionAvatarUrl(session);
	const sessionMode = session?.mode ?? null;

	const sidebarUserProps = {
		userName,
		userEmail,
		userAvatar,
		sessionMode,
	};

	useEffect(() => {
		void sessionStore.getState().load();
	}, []);
	useEffect(() => {
		if (session && status === "ready" && generalSettingsStore.getState().status === "idle")
			void generalSettingsStore.getState().load();
	}, [session, status]);

	useEffect(() => {
		void pathname;
		setMobileOpen(false);
	}, [pathname]);

	useEffect(() => {
		if (isMobile === false) {
			setMobileOpen(false);
		}
	}, [isMobile]);

	if (status === "loading" && !session) {
		return (
			<LoadingScreen
				label="正在读取会话…"
				mark={<img src={BRAND_MARK_SRC} alt={APP_NAME} width={48} height={48} />}
			/>
		);
	}

	if (status === "error" && !session) {
		return (
			<div className="flex h-screen items-center justify-center bg-basalt-background p-6">
				<LayerCard className="max-w-md">
					<Banner
						variant="error"
						title={expired ? "会话已过期" : "无法读取会话"}
						description={expired ? "请重新登录后再打开编年史。" : (error ?? "请重试。")}
						action={
							expired ? (
								<Banner.Action onClick={() => window.location.reload()}>重新登录</Banner.Action>
							) : (
								<Banner.Action onClick={() => void sessionStore.getState().load()}>
									重试
								</Banner.Action>
							)
						}
					/>
				</LayerCard>
			</div>
		);
	}

	const breadcrumbs =
		pathname === "/"
			? [{ label: meta.title }]
			: [{ label: "编年史", href: "/" }, { label: meta.title }];

	return (
		<AppShell>
			<AppSkipLink>跳到主要内容</AppSkipLink>
			{isMobile !== true && (
				<div className="hidden md:block">
					<PersistedSidebarProvider>
						<AppSidebar ariaLabel="主导航" {...sidebarUserProps} />
					</PersistedSidebarProvider>
				</div>
			)}
			{isMobile !== false && (
				<SidebarDrawer
					id={drawerId}
					open={mobileOpen}
					onOpenChange={setMobileOpen}
					returnFocusRef={menuButton}
					title="导航菜单"
					description="浏览 Life.ai 的主要页面"
				>
					<AppSidebar
						ariaLabel="主导航抽屉"
						variant="mobile"
						enableShortcut={isMobile === true}
						onNavigate={() => setMobileOpen(false)}
						onDismiss={() => setMobileOpen(false)}
						{...sidebarUserProps}
					/>
				</SidebarDrawer>
			)}
			<AppMain>
				<AppHeader
					leading={
						isMobile === true ? (
							<AppHeaderMenuButton
								ref={menuButton}
								label="打开导航菜单"
								aria-controls={drawerId}
								aria-expanded={mobileOpen}
								onClick={() => setMobileOpen(true)}
							/>
						) : undefined
					}
					breadcrumbs={breadcrumbs}
					breadcrumbsLabel="面包屑导航"
					actions={
						<>
							<AccentControl />
							<ProjectLinks
								github="nocoo/life.ai"
								hexly="life-ai"
								name="Life.ai"
								githubLabel="GitHub repository"
								hexlyLabel="Life.ai on hexly.ai"
							/>
							<ThemeToggle
								labels={{
									light: "Switch to light theme",
									dark: "Switch to dark theme",
									system: "Use system theme",
								}}
							/>
						</>
					}
				/>
				<div className="flex min-h-0 flex-1 flex-col px-2 pb-2 md:px-3 md:pb-3">
					<ContentIsland>
						<Suspense fallback={<PageFallback />}>
							<Outlet />
						</Suspense>
					</ContentIsland>
				</div>
			</AppMain>
		</AppShell>
	);
}
