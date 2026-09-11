import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "MuhanAI Desktop",
	description: "AI-powered desktop environment",
	manifest: "/manifest.json",
	appleWebApp: {
		capable: true,
		statusBarStyle: "black-translucent",
		title: "MuhanAI",
	},
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
