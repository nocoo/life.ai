import { describe, expect, it } from "vitest";
import {
	type DiaryDocument,
	parseDiaryDocument,
	readDiaryContent,
} from "../../../src/models/diary";

const document: DiaryDocument = {
	version: 1,
	narrative: '上午去了河畔书屋。\n\n买了一本《旅行中的"小事"》。',
	sections: {
		development: {
			summary: "电脑上的开发线索。",
			highlights: ["窗口出现 Life.ai，不能据此断定持续工作。"],
		},
		writing: { summary: "发表了一篇文章。", highlights: ["文章的写作起点未知。"] },
		github: { summary: "项目有新进展。", highlights: ["一条提交可能由自动化生成。"] },
	},
};

describe("structured diary content", () => {
	it("preserves escaped punctuation and paragraphs and separates the rendered content from its cards", () => {
		const raw = JSON.stringify(document);
		expect(parseDiaryDocument(raw)).toEqual(document);
		expect(readDiaryContent(raw)).toEqual({
			content: document.narrative,
			sections: document.sections,
		});
		expect(
			parseDiaryDocument(
				JSON.stringify({
					...document,
					sections: { development: null, writing: null, github: null },
				}),
			).sections,
		).toEqual({ development: null, writing: null, github: null });
	});

	it.each([
		"这是一段未按约定格式输出的正文。",
		'```json\n{"version":1}\n```',
		'{"version":1，"narrative":"中文逗号不是分隔符"}',
		'{"version":1,}',
		'{"narrative":"字面换行\n不能出现在 JSON 字符串中"}',
		JSON.stringify(null),
		JSON.stringify([document]),
		JSON.stringify({ ...document, version: "1" }),
		JSON.stringify({ ...document, version: 2 }),
		JSON.stringify({ ...document, narrative: "   " }),
		JSON.stringify({ ...document, narrative: ["段落"] }),
		JSON.stringify({ ...document, narrative: "字".repeat(2_001) }),
		JSON.stringify({ ...document, development: document.sections.development }),
		JSON.stringify({ ...document, sections: { development: null, github: null } }),
		JSON.stringify({ ...document, sections: { ...document.sections, writing: "一篇文章" } }),
		JSON.stringify({
			...document,
			sections: { ...document.sections, writing: { summary: "文章", highlights: [] } },
		}),
		JSON.stringify({
			...document,
			sections: { ...document.sections, writing: { summary: "文章", highlights: [42] } },
		}),
		JSON.stringify({
			...document,
			sections: { ...document.sections, writing: { summary: "文章", highlights: ["   "] } },
		}),
		JSON.stringify({
			...document,
			sections: {
				...document.sections,
				writing: { summary: "文章", highlights: Array(6).fill("过多要点") },
			},
		}),
		JSON.stringify({
			...document,
			sections: {
				...document.sections,
				writing: { summary: "字".repeat(241), highlights: ["一条要点"] },
			},
		}),
		JSON.stringify({
			...document,
			sections: {
				...document.sections,
				writing: { summary: "文章", highlights: ["字".repeat(401)] },
			},
		}),
	])("rejects invalid syntax, field positions and content types %#", (raw) => {
		expect(() => parseDiaryDocument(raw)).toThrow();
	});

	it("keeps existing plain-text diaries intact, including their paragraph breaks", () => {
		const content = "从前的一则日记。\n\n晚饭后散了步。";
		expect(readDiaryContent(content)).toEqual({ content });
	});
});
