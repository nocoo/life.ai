import { z } from "zod";

const sectionSchema = z.strictObject({
	summary: z.string().trim().min(1).max(240),
	highlights: z.array(z.string().trim().min(1).max(400)).min(1).max(5),
});

/** The model supplies content; the application owns headings, icons and layout. */
export const diaryDocumentSchema = z.strictObject({
	version: z.literal(1),
	narrative: z.string().trim().min(1).max(2_000),
	sections: z.strictObject({
		development: sectionSchema.nullable(),
		writing: sectionSchema.nullable(),
		github: sectionSchema.nullable(),
	}),
});

export type DiaryDocument = z.infer<typeof diaryDocumentSchema>;
export type DiarySections = DiaryDocument["sections"];

/** New generations must pass both JSON syntax and the complete, strict field contract. */
export function parseDiaryDocument(content: string): DiaryDocument {
	return diaryDocumentSchema.parse(JSON.parse(content));
}

/** Existing plain-text diaries remain readable without rewriting any saved data. */
export function readDiaryContent(content: string): { content: string; sections?: DiarySections } {
	try {
		const document = parseDiaryDocument(content);
		return { content: document.narrative, sections: document.sections };
	} catch {
		return { content };
	}
}
