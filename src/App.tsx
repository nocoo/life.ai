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

export function App() {
	return (
		<AppProviders>
			<BrowserRouter>
				<Routes>
					<Route element={<AppFrame />}>
						<Route path="/" element={<TimelinePage />} />
						<Route path="/imports" element={<ImportsPage />} />
						<Route path="/connect" element={<ConnectPage />} />
						<Route path="*" element={<NotFoundPage />} />
					</Route>
				</Routes>
			</BrowserRouter>
		</AppProviders>
	);
}
