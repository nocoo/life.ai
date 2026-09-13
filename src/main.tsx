import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { hydrateDocumentChrome } from "./components/hydrate-chrome";
import "./styles.css";

hydrateDocumentChrome();

const root = document.getElementById("root");
if (!root) {
	throw new Error("Missing #root");
}

createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
