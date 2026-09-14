import { lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { AppFrame } from "./components/app-frame";
import { AppProviders } from "./components/app-providers";
import { NotFoundPage } from "./views/not-found-page";

const TimelinePage = lazy(() =>
	import("./views/timeline-page").then((module) => ({ default: module.TimelinePage })),
);
const ImportsPage = lazy(() =>
	import("./views/imports-page").then((module) => ({ default: module.ImportsPage })),
);
const ConnectPage = lazy(() =>
	import("./views/connect-page").then((module) => ({ default: module.ConnectPage })),
);
const AiSettingsPage = lazy(() =>
	import("./views/ai-settings-page").then((module) => ({ default: module.AiSettingsPage })),
);
const GeneralSettingsPage = lazy(() =>
	import("./views/general-settings-page").then((module) => ({
		default: module.GeneralSettingsPage,
	})),
);
const DaySourcesPage = lazy(() =>
	import("./views/day-sources-page").then((module) => ({ default: module.DaySourcesPage })),
);
const DataOverviewPage = lazy(() =>
	import("./views/data-overview-page").then((module) => ({ default: module.DataOverviewPage })),
);
const FootprintPage = lazy(() =>
	import("./views/footprint-page").then((module) => ({ default: module.FootprintPage })),
);

const AppleHealthPage = lazy(() =>
	import("./views/apple-health-page").then((module) => ({ default: module.AppleHealthPage })),
);
const PixiuPage = lazy(() =>
	import("./views/pixiu-page").then((module) => ({ default: module.PixiuPage })),
);

export function App() {
	return (
		<AppProviders>
			<BrowserRouter>
				<Routes>
					<Route element={<AppFrame />}>
						<Route path="/" element={<TimelinePage />} />
						<Route path="/imports" element={<ImportsPage />} />
						<Route path="/connect" element={<ConnectPage />} />
						<Route path="/settings/ai" element={<AiSettingsPage />} />
						<Route path="/settings/general" element={<GeneralSettingsPage />} />
						<Route path="/settings/sources" element={<DaySourcesPage />} />
						<Route path="/data" element={<DataOverviewPage />} />
						<Route path="/data/footprint" element={<FootprintPage />} />
						<Route path="/data/apple-health" element={<AppleHealthPage />} />
						<Route path="/data/pixiu" element={<PixiuPage />} />
						<Route path="*" element={<NotFoundPage />} />
					</Route>
				</Routes>
			</BrowserRouter>
		</AppProviders>
	);
}
