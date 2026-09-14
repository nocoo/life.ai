import { useEffect, useState } from "react";

const MOBILE_QUERY = "(max-width: 767px)";

export function useIsMobile(): boolean {
	const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
	useEffect(() => {
		const media = window.matchMedia(MOBILE_QUERY);
		const onChange = () => setIsMobile(media.matches);
		onChange();
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, []);
	return isMobile;
}
