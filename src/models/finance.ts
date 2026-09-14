import type { JsonValue, LifeEvent } from "./types";

export interface FinanceCurrency {
	currency: string;
	count: number;
	incomeMinor: number;
	expenseMinor: number;
	transfersMinor: number;
	expenseInflowMinor: number;
	otherInflowMinor: number;
	otherOutflowMinor: number;
	classifications: { name: string; count: number; inflowMinor: number; outflowMinor: number }[];
	categories: { name: string; count: number; amountMinor: number }[];
}
export interface FinanceDay {
	recordCount: number;
	sourceDates: string[];
	accounts: string[];
	notes: string[];
	currencies: FinanceCurrency[];
}

function money(value: JsonValue | undefined): number {
	if (typeof value !== "number" && typeof value !== "string") return 0;
	const text = String(value).trim();
	if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) return 0;
	const [whole = "0", fraction = ""] = text.replace("-", "").split(".");
	const minor =
		(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))) * (text.startsWith("-") ? -1n : 1n);
	return minor > BigInt(Number.MAX_SAFE_INTEGER) || minor < BigInt(Number.MIN_SAFE_INTEGER)
		? 0
		: Number(minor);
}
function add(left: number, right: number): number {
	if (!Number.isSafeInteger(left + right)) throw new Error("金额超出精确汇总范围");
	return left + right;
}

export function formatMinor(minor: number): string {
	const value = BigInt(minor < 0 ? -minor : minor);
	return `${minor < 0 ? "-" : ""}${(value / 100n).toLocaleString("zh-CN")}.${String(value % 100n).padStart(2, "0")}`;
}

/** Distinguish accounting classifications before deciding which flows are income or consumption. */
export function createFinanceCollector() {
	const currencies = new Map<string, FinanceCurrency>();
	const dates = new Set<string>();
	const accounts = new Set<string>();
	const notes = new Set<string>();
	let recordCount = 0;
	return {
		add(event: LifeEvent) {
			if (event.sourceId !== "pixiu") return;
			const data =
				event.data && typeof event.data === "object" && !Array.isArray(event.data)
					? event.data
					: {};
			const text = (field: string) =>
				typeof data[field] === "string" ? (data[field] as string) : "";
			const currency = text("币种").trim().toUpperCase() || "未注明币种";
			const classification = text("交易分类");
			const type = text("交易类型") || event.title;
			const incoming = money(data.流入金额);
			const outgoing = money(data.流出金额);
			const total = currencies.get(currency) ?? {
				currency,
				count: 0,
				incomeMinor: 0,
				expenseMinor: 0,
				transfersMinor: 0,
				expenseInflowMinor: 0,
				otherInflowMinor: 0,
				otherOutflowMinor: 0,
				classifications: [],
				categories: [],
			};
			total.count++;
			recordCount++;
			const transfer =
				classification === "转账" || (!classification && /转账|转入|转出|transfer/i.test(type));
			if (transfer)
				total.transfersMinor = add(
					total.transfersMinor,
					Math.max(Math.abs(incoming), Math.abs(outgoing)),
				);
			else if (classification === "日常支出") {
				total.expenseMinor = add(total.expenseMinor, outgoing);
				total.expenseInflowMinor = add(total.expenseInflowMinor, incoming);
			} else if (classification === "日常收入")
				total.incomeMinor = add(total.incomeMinor, incoming);
			else if (!classification) {
				// Legacy records without a classification retain their original flow semantics.
				total.incomeMinor = add(total.incomeMinor, incoming);
				total.expenseMinor = add(total.expenseMinor, outgoing);
			} else {
				total.otherInflowMinor = add(total.otherInflowMinor, incoming);
				total.otherOutflowMinor = add(total.otherOutflowMinor, outgoing);
			}
			let group = total.classifications.find((item) => item.name === (classification || "未分类"));
			if (!group) {
				group = { name: classification || "未分类", count: 0, inflowMinor: 0, outflowMinor: 0 };
				total.classifications.push(group);
			}
			group.count++;
			group.inflowMinor = add(group.inflowMinor, incoming);
			group.outflowMinor = add(group.outflowMinor, outgoing);
			if (classification === "日常支出" || (!classification && !transfer && outgoing !== 0)) {
				let category = total.categories.find((item) => item.name === type);
				if (!category) {
					category = { name: type, count: 0, amountMinor: 0 };
					total.categories.push(category);
				}
				category.count++;
				category.amountMinor = add(category.amountMinor, outgoing);
			}
			const date = text("sourceDate") || text("日期");
			if (date) dates.add(date);
			if (text("资金账户")) accounts.add(text("资金账户"));
			if (text("备注") && notes.size < 6 && classification === "日常支出") notes.add(text("备注"));
			currencies.set(currency, total);
		},
		finish(): FinanceDay {
			const ordered = [...currencies.values()].sort((a, b) => a.currency.localeCompare(b.currency));
			for (const currency of ordered) {
				currency.categories.sort(
					(a, b) => b.amountMinor - a.amountMinor || a.name.localeCompare(b.name),
				);
				currency.classifications.sort((a, b) => a.name.localeCompare(b.name));
			}
			return {
				recordCount,
				currencies: ordered,
				sourceDates: [...dates].sort(),
				accounts: [...accounts].sort(),
				notes: [...notes],
			};
		},
	};
}

export function buildFinanceDay(events: LifeEvent[]): FinanceDay {
	const collector = createFinanceCollector();
	for (const event of new Map(events.map((event) => [event.id, event])).values())
		collector.add(event);
	return collector.finish();
}
