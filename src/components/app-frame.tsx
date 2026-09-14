import { Button, ContentIsland, Sheet, SheetContent, SheetTitle, ThemeToggle } from "@nocoo/basalt";
import { AppHeader } from "@nocoo/basalt/components/app-header";
import { AppMain, AppShell, AppSkipLink } from "@nocoo/basalt/components/app-shell";
import { Banner } from "@nocoo/basalt/components/banner";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { LoadingScreen } from "@nocoo/basalt/components/loading-screen";
import { ExternalLink, Menu } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
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
import { AppSidebar } from "./app-sidebar";
import { APP_NAME, BRAND_MARK_SRC, GITHUB_REPO_URL } from "./brand";
import { routeMeta } from "./navigation";
import { PageFallback } from "./page-fallback";
import { useIsMobile } from "./use-is-mobile";

export function AppFrame() {
	const [collapsed, setCollapsed] = useState(false);
	const [mobileOpen, setMobileOpen] = useState(false);
	const isMobile = useIsMobile();
	const location = useLocation();
	const pathname = location.pathname;
	const session = useStore(sessionStore, (state) => state.session);
	const status = useStore(sessionStore, (state) => state.status);
	const error = useStore(sessionStore, (state) => state.error);
	const expired = useStore(sessionStore, (state) => state.expired);
	const meta = routeMeta(pathname);
	const userName = sessionDisplayName(session);
	const userEmail = sessionSecondaryText(session);
	const userAvatar = sessionAvatarUrl(session);

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

	useEffect(() => {
		document.body.style.overflow = mobileOpen ? "hidden" : "";
		return () => {
			document.body.style.overflow = "";
		};
	}, [mobileOpen]);

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

	return (
		<AppShell>
			<AppSkipLink>跳到主要内容</AppSkipLink>
			{isMobile !== true && (
				<div className="hidden md:block">
					<AppSidebar
						collapsed={collapsed}
						enableShortcut={isMobile === false}
						onToggle={() => setCollapsed((value) => !value)}
						userName={userName}
						userEmail={userEmail}
						userAvatar={userAvatar}
					/>
				</div>
			)}
			{isMobile !== false && (
				<Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
					<SheetContent
						side="left"
						className="w-[260px] max-w-[260px] border-0 bg-basalt-background p-0 md:hidden"
					>
						<SheetTitle className="sr-only">导航</SheetTitle>
						<AppSidebar
							collapsed={false}
							enableShortcut={isMobile === true}
							onToggle={() => setMobileOpen(false)}
							onNavigate={() => setMobileOpen(false)}
							userName={userName}
							userEmail={userEmail}
							userAvatar={userAvatar}
						/>
					</SheetContent>
				</Sheet>
			)}
			<AppMain>
				<AppHeader
					leading={
						<Button
							variant="ghost"
							size="icon"
							className="h-8 w-8 md:hidden"
							onClick={() => setMobileOpen(true)}
							aria-label="打开导航"
						>
							<Menu className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
						</Button>
					}
					breadcrumbs={[{ label: meta.title }]}
					actions={
						<>
							<Button variant="ghost" size="icon" asChild>
								<a
									href={GITHUB_REPO_URL}
									target="_blank"
									rel="noopener noreferrer"
									aria-label="GitHub 仓库"
								>
									<ExternalLink
										className="h-[18px] w-[18px]"
										strokeWidth={1.5}
										aria-hidden="true"
									/>
								</a>
							</Button>
							<AccentControl />
							<ThemeToggle aria-label="切换主题" />
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
