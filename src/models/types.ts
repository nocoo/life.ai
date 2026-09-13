export type Precision = "day" | "hour" | "minute" | "second";
export type ImportSourceId = "apple-health" | "footprint" | "pixiu" | "journal";
export type SourceKind = "import" | "connect";
export type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue };

export interface ImportRecord {
	key: string;
	occurredAt: string;
	endAt?: string | null;
	precision?: Precision;
	title: string;
	content?: string;
	data?: JsonValue;
}

export interface LifeEvent {
	id: string;
	sourceId: string;
	sourceName: string;
	sourceKind: SourceKind;
	occurredAt: string;
	endAt: string | null;
	precision: Precision;
	title: string;
	content: string;
	data: JsonValue;
	updatedAt: string;
}

export interface Source {
	id: string;
	name: string;
	kind: SourceKind;
	provider: ImportSourceId | "connect";
	recordCount: number;
	lastEventAt: string | null;
}

export interface Connect {
	id: string;
	name: string;
	prefix: string;
	createdAt: string;
	lastUsedAt: string | null;
	revokedAt: string | null;
	recordCount: number;
}

export interface Session {
	email: string | null;
	subject: string;
	mode: "access" | "local";
	name?: string | null;
	avatar?: string | null;
}

export interface EventPage {
	events: LifeEvent[];
	nextCursor: string | null;
}

export interface CreatedConnect {
	connect: Connect;
	token: string;
}

export interface IngestReceipt {
	id: string;
	occurredAt: string;
	precision: "hour";
	updatedAt: string;
}

export interface ImportProgress {
	bytesRead: number;
	totalBytes: number;
	processed: number;
	accepted: number;
}

export interface HourSlot {
	hour: number;
	label: string;
	instants: number[];
	events: LifeEvent[];
	state: "normal" | "missing" | "repeated";
}

export interface DayTimeline {
	date: string;
	start: string;
	end: string;
	timezone: string;
	hours: HourSlot[];
	allDay: LifeEvent[];
	totalEvents: number;
	activeHours: number;
	sourceCount: number;
}
