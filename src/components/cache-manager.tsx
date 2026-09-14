import { Badge, Button, LayerCard } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@nocoo/basalt/components/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@nocoo/basalt/components/select";
import {
	BookOpen,
	CloudSun,
	Database,
	GitFork,
	MapPin,
	Monitor,
	RefreshCw,
	Sun,
	Trash2,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { CACHE_NAMES, type CacheQuery } from "../models/cache";
import { cacheStore, cacheUpdatedLabel } from "../viewmodels/cache-view-model";

const ICONS = {
	github: GitFork,
	gecko: Monitor,
	firefly: BookOpen,
	sun: Sun,
	weather: CloudSun,
	place: MapPin,
};

export function CacheManager({ day }: { day: string }) {
	const [open, setOpen] = useState(false);
	const [scope, setScope] = useState<CacheQuery["scope"]>("day");
	const { overview, status, clearing, error, message } = useStore(cacheStore);
	useEffect(() => {
		if (!open) return;
		void cacheStore.getState().load(scope === "day" ? { scope, date: day } : { scope });
		return () => cacheStore.getState().reset();
	}, [day, open, scope]);
	const busy = status === "loading" || clearing !== null;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm" aria-label="管理数据缓存">
					<Database size={16} aria-hidden="true" />
					缓存
				</Button>
			</DialogTrigger>
			<DialogContent size="lg">
				<DialogClose asChild>
					<Button
						variant="ghost"
						size="icon"
						className="absolute right-3 top-3"
						aria-label="关闭缓存面板"
					>
						<X size={16} aria-hidden="true" />
					</Button>
				</DialogClose>
				<DialogHeader className="pr-8">
					<DialogTitle>数据缓存</DialogTitle>
					<DialogDescription>
						清除后，下次读取会重新查询。PAT、原始记录和日记会保留。
					</DialogDescription>
				</DialogHeader>
				<div className="flex items-center justify-between gap-3">
					<Select
						value={scope}
						onValueChange={(value) => setScope(value as CacheQuery["scope"])}
						disabled={clearing !== null}
					>
						<SelectTrigger aria-label="缓存日期范围" className="w-[220px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="day">所选日期 · {day}</SelectItem>
							<SelectItem value="all">所有日期</SelectItem>
						</SelectContent>
					</Select>
					<Button
						variant="ghost"
						size="icon"
						aria-label="刷新缓存列表"
						disabled={busy}
						onClick={() =>
							void cacheStore.getState().load(scope === "day" ? { scope, date: day } : { scope })
						}
					>
						<RefreshCw size={16} aria-hidden="true" />
					</Button>
				</div>
				{error ? <Banner variant="error" title="缓存操作失败" description={error} /> : null}
				{status === "idle" || status === "loading" ? (
					<p role="status" className="text-sm text-basalt-muted-foreground">
						正在读取缓存…
					</p>
				) : null}
				<section className="space-y-2" aria-label="缓存来源">
					{overview?.entries.map((entry) => {
						const Icon = ICONS[entry.kind];
						return (
							<LayerCard key={entry.kind} className="p-3" data-cache-kind={entry.kind}>
								<div className="flex items-center justify-between gap-3">
									<div className="min-w-0 space-y-1">
										<div className="flex flex-wrap items-center gap-2 text-sm font-medium">
											<Icon size={16} aria-hidden="true" />
											{CACHE_NAMES[entry.kind]}
											<Badge variant="secondary">{entry.count} 条</Badge>
										</div>
										<p className="text-xs text-basalt-muted-foreground">
											{cacheUpdatedLabel(entry.updatedAt)}
										</p>
										{entry.kind === "place" ? (
											<p className="text-xs text-basalt-muted-foreground">
												跨日期共享 · 清除会影响所有日期的地点名称缓存
											</p>
										) : null}
									</div>
									<Button
										variant="ghost"
										size="sm"
										className="shrink-0"
										aria-label={`清除${CACHE_NAMES[entry.kind]}缓存`}
										disabled={busy || entry.count === 0}
										loading={clearing === entry.kind}
										onClick={() => void cacheStore.getState().clear(entry.kind)}
									>
										<Trash2 size={14} aria-hidden="true" />
										清除
									</Button>
								</div>
							</LayerCard>
						);
					})}
				</section>
				{message ? (
					<p role="status" className="text-sm">
						{message}已显示的卡片暂时保留。
					</p>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
