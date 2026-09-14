import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { SkeletonLine } from "@nocoo/basalt/components/skeleton-line";
import { useLocation } from "react-router";
import { routeMeta } from "./navigation";
import {
	AiSettingsSkeleton,
	ConnectPageSkeleton,
	DataOverviewSkeleton,
	DaySourcesSkeleton,
	GeneralSettingsSkeleton,
	ImportPageSkeleton,
	JournalImportSkeleton,
	TimelineSkeleton,
} from "./page-skeletons";

export function PageFallback() {
	const { pathname } = useLocation();
	const meta = routeMeta(pathname);
	if (pathname === "/") {
		return (
			<div className="story-page">
				<div className="story-page-header">
					<PageHeader
						title="每日实录"
						description={<SkeletonLine className="h-4 max-w-40" />}
						filters={
							<div className="flex flex-wrap gap-3" aria-hidden="true">
								{["date", "source", "radius", "map"].map((control) => (
									<SkeletonLine key={control} minWidth={100} className="h-9 max-w-48 rounded-md" />
								))}
							</div>
						}
					/>
				</div>
				<SkeletonLine minWidth={100} className="mb-6 h-9 max-w-80 rounded-md" />
				<TimelineSkeleton />
			</div>
		);
	}
	return (
		<div className={`min-w-0 space-y-6${pathname === "/data" ? " data-overview-page" : ""}`}>
			<PageHeader
				title={pathname === "/imports" ? "日记导入" : meta.title}
				description={meta.description}
				actions={
					pathname.startsWith("/data") ? (
						<SkeletonLine minWidth={100} className="h-9 w-36 rounded-md" style={{ width: 144 }} />
					) : undefined
				}
			/>
			{pathname === "/data" ? (
				<>
					<SkeletonLine className="h-5 max-w-64" />
					<DataOverviewSkeleton />
				</>
			) : null}
			{pathname === "/settings/general" ? <GeneralSettingsSkeleton /> : null}
			{pathname === "/settings/sources" ? <DaySourcesSkeleton /> : null}
			{pathname === "/settings/ai" ? (
				<LayerCard>
					<LayerCard.Header>模型</LayerCard.Header>
					<LayerCard.Body>
						<AiSettingsSkeleton />
					</LayerCard.Body>
				</LayerCard>
			) : null}
			{pathname === "/connect" ? <ConnectPageSkeleton /> : null}
			{pathname === "/imports" ? <JournalImportSkeleton /> : null}
			{pathname === "/data/footprint" ? <ImportPageSkeleton provider="footprint" /> : null}
			{pathname === "/data/apple-health" ? <ImportPageSkeleton provider="apple-health" /> : null}
			{pathname === "/data/pixiu" ? <ImportPageSkeleton provider="pixiu" /> : null}
		</div>
	);
}
