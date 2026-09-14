import type { LucideIcon } from "lucide-react";
import {
	CalendarClock,
	Database,
	HeartPulse,
	KeyRound,
	MapPin,
	Settings,
	Settings2,
	Upload,
	Wallet,
} from "lucide-react";

export interface NavItem {
	href: string;
	label: string;
	icon: LucideIcon;
}

export interface NavGroup {
	id: string;
	label: string;
	items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
	{
		id: "chronicle",
		label: "编年史",
		items: [{ href: "/", label: "时间线", icon: CalendarClock }],
	},
	{
		id: "data",
		label: "数据管理",
		items: [
			{ href: "/data", label: "数据概览", icon: Database },
			{ href: "/data/footprint", label: "Footprint", icon: MapPin },
			{ href: "/data/apple-health", label: "Apple Health", icon: HeartPulse },
			{ href: "/data/pixiu", label: "貔貅记账", icon: Wallet },
		],
	},
	{
		id: "settings",
		label: "设置",
		items: [
			{ href: "/settings/general", label: "通用设置", icon: Settings2 },
			{ href: "/settings/ai", label: "AI 设置", icon: Settings },
			{ href: "/connect", label: "Connect", icon: KeyRound },
			{ href: "/imports", label: "导入", icon: Upload },
		],
	},
];

export const SETTINGS_GROUP_ID = "settings";

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

export const ROUTE_META: Record<string, { title: string; description: string }> = {
	"/": {
		title: "时间线",
		description: "按本地日期查看 24 小时与全天记录",
	},
	"/imports": {
		title: "导入",
		description: "导入日记 JSON/NDJSON",
	},
	"/connect": {
		title: "Connect",
		description: "签发只写令牌，按 UTC 小时覆盖写入",
	},
	"/settings/general": {
		title: "通用设置",
		description: "常用地点与惯常作息",
	},
	"/settings/ai": {
		title: "AI 设置",
		description: "配置 Workers AI 或其他模型",
	},
	"/data": {
		title: "数据概览",
		description: "各来源的覆盖天数、记录与最近导入",
	},
	"/data/apple-health": {
		title: "Apple Health",
		description: "导入完整健康档案，回看身体与生活的节律",
	},
	"/data/footprint": {
		title: "Footprint",
		description: "解析 GPX，按 UTC 日整日替换轨迹",
	},
	"/data/pixiu": { title: "貔貅记账", description: "按北京时间记账日导入完整账目" },
};

export function routeMeta(pathname: string): { title: string; description: string } {
	return ROUTE_META[pathname] ?? { title: "未找到", description: "" };
}
