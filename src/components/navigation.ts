import type { LucideIcon } from "lucide-react";
import {
	CalendarClock,
	Database,
	HeartPulse,
	KeyRound,
	MapPin,
	Plug,
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
			{ href: "/settings/sources", label: "数据源", icon: Plug },
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
		description: "导入 JSON 或 NDJSON 随记，补充每日实录里的文字与片刻。",
	},
	"/connect": {
		title: "Connect",
		description: "只写令牌，明文只出现一次。同一 UTC 小时再次写入会替换该小时；未来小时有效。",
	},
	"/settings/general": {
		title: "通用设置",
		description:
			"记下常去的地方，以及你习惯的入睡和起床时间。日记会用它们理解一天的节奏，而不会替你下结论。",
	},
	"/settings/ai": {
		title: "AI 设置",
		description: "默认使用 Cloudflare Workers AI，不必填写密钥。测试连接使用已保存的配置。",
	},
	"/settings/sources": {
		title: "数据源",
		description: "连接电脑活动与公开文章，按天读入时间线和日记。",
	},
	"/data": {
		title: "数据概览",
		description: "汇总每一种来源留下的记录，回看它们覆盖的日子。",
	},
	"/data/apple-health": {
		title: "Apple Health",
		description: "导入 Apple 健康导出记录，完整保留体征、睡眠、锻炼及路线细节。",
	},
	"/data/footprint": {
		title: "Footprint",
		description: "导入 GPS 足迹，在每日实录中回看走过的地方。",
	},
	"/data/pixiu": { title: "貔貅记账", description: "把一日的花费与收获，放回生活的故事里。" },
};

export function routeMeta(pathname: string): { title: string; description: string } {
	return ROUTE_META[pathname] ?? { title: "未找到", description: "" };
}
