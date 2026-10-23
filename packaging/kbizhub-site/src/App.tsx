/**
 * kbizhub landing page.
 *
 * The one file that knows the section order and how the sections are wired to
 * shared behaviour. Each section is presentational and takes the handler it
 * needs as a prop, so none of them reach for a global.
 *
 * Section order and anchors match the original index.html, so existing links
 * (#starter, #mybiz, …) keep working.
 *
 * See KBIZHUB_REACT_MIGRATION_4AGENTS.md for the ownership table.
 */

import { useCallback, useState } from "react";
import { Nav } from "./components/Nav";
import { StarterModal } from "./components/StarterModal";
import type { StarterOrder } from "./lib/orders";
import { AgentSeo } from "./sections/AgentSeo";
import { Comparison } from "./sections/Comparison";
import { Economy } from "./sections/Economy";
import { Hero } from "./sections/Hero";
import { HumanExpert } from "./sections/HumanExpert";
import { Marketplace } from "./sections/Marketplace";
import { MessageCenter } from "./sections/MessageCenter";
import { MyBiz } from "./sections/MyBiz";
import { Pipeline } from "./sections/Pipeline";
import { TeamBuilder } from "./sections/TeamBuilder";
import { TemplateStudio } from "./sections/TemplateStudio";
import { Why } from "./sections/Why";

export function App() {
	const [orderOpen, setOrderOpen] = useState(false);
	const openOrder = useCallback(() => setOrderOpen(true), []);
	const closeOrder = useCallback(() => setOrderOpen(false), []);

	// Every "생성하기" CTA opens the same starter order modal — the original page
	// exposed one global openStarterModal() and every section called it, so the
	// single-instance behaviour is preserved rather than duplicated per section.
	const handleSubmitted = useCallback((order: StarterOrder) => {
		// The modal renders its own success panel; this is the hook for analytics
		// or a redirect once a backend exists.
		console.info("[kbizhub] order created", order.bizName);
	}, []);

	return (
		<>
			<Nav />
			<main>
				<Hero />
				<MyBiz onManageAgents={() => console.info("[kbizhub] manage agents")} />
				<Pipeline onOpenStarter={openOrder} />
				<AgentSeo onOpenStarter={openOrder} />
				<TeamBuilder onCreateTeam={openOrder} />
				<Marketplace onOpenStarter={openOrder} />
				<HumanExpert onOpenStarter={openOrder} />
				<Why />
				<Comparison />
				<Economy onCreateNode={openOrder} />
				<MessageCenter onActivate={openOrder} />
				<TemplateStudio onOpenStudio={openOrder} />
			</main>
			<StarterModal open={orderOpen} onClose={closeOrder} onSubmitted={handleSubmitted} />
		</>
	);
}
