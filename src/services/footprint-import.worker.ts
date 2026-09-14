/// <reference lib="webworker" />

import { parseFootprint } from "../models/footprint";
import {
	createFootprintImportHost,
	type FootprintWorkerIn,
	type FootprintWorkerOut,
} from "./footprint-browser";
import { createFootprintClient, uploadFootprintPlan } from "./footprint-client";

export function bindFootprintWorker(scope: {
	onmessage: ((event: MessageEvent<FootprintWorkerIn>) => void) | null;
	postMessage: (message: FootprintWorkerOut) => void;
}): ReturnType<typeof createFootprintImportHost> {
	const host = createFootprintImportHost(
		(message) => {
			scope.postMessage(message);
		},
		{ parseFootprint, createFootprintClient, uploadFootprintPlan },
	);
	scope.onmessage = (event: MessageEvent<FootprintWorkerIn>) => {
		void host.handle(event.data);
	};
	return host;
}

export function maybeBindDedicatedWorker(): void {
	if (typeof self !== "undefined") {
		bindFootprintWorker(self);
	}
}

maybeBindDedicatedWorker();
