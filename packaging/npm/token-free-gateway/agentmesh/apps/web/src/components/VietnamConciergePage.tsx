import {
	ArrowRight,
	Building2,
	ChevronDown,
	Compass,
	Languages,
	MapPin,
	Newspaper,
	Search,
	ShieldCheck,
	ShoppingBag,
	Sparkles,
	Utensils,
	WalletCards,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import "./vietnam-concierge.css";

interface VietnamInsight {
	title: string;
	url: string;
	description: string;
	date: string | null;
	source: string;
	address?: string;
}

interface VietnamInsightResponse {
	items: VietnamInsight[];
	configured: boolean;
	message?: string;
}

const SERVICES = [
	{ icon: Building2, label: "숙소 찾기", detail: "호텔 · 월세 · 장기체류" },
	{ icon: Utensils, label: "식당 찾기", detail: "현지 맛집 · 가족식사" },
	{ icon: ShoppingBag, label: "쇼핑", detail: "가격비교 · 공동구매" },
	{ icon: Compass, label: "이동", detail: "택시 · 공항 · 동선" },
	{ icon: WalletCards, label: "가격·환율", detail: "VND · KRW · USD" },
	{ icon: Newspaper, label: "베트남 정보", detail: "뉴스 · 정책 · 생활" },
];

const EXAMPLES = [
	"다낭에서 한 달 살기 좋은 동네와 예산을 알려줘",
	"미케비치 근처 가족 식당 3곳을 비교해줘",
	"오늘 원화 100만원이면 베트남에서 얼마나 쓸 수 있어?",
];

export const VietnamConciergePage: React.FC = () => {
	const [query, setQuery] = useState("");
	const [selectedService, setSelectedService] = useState("숙소 찾기");
	const [submitted, setSubmitted] = useState(false);
	const [insights, setInsights] = useState<VietnamInsight[]>([]);
	const [insightLoading, setInsightLoading] = useState(false);
	const [insightMessage, setInsightMessage] = useState<string | null>(null);

	const submitQuery = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!query.trim()) return;
		setSubmitted(true);
		setInsightLoading(true);
		setInsightMessage(null);
		try {
			const response = await fetch(
				`/api/vietnam/insight?q=${encodeURIComponent(query)}&category=news`,
				{
					credentials: "include",
				},
			);
			const data = (await response.json()) as VietnamInsightResponse & { error?: string };
			if (!response.ok) throw new Error(data.error ?? "Vietnam insight search failed");
			setInsights(data.items ?? []);
			setInsightMessage(
				data.configured ? null : (data.message ?? "Naver 검색이 아직 설정되지 않았습니다."),
			);
		} catch (error) {
			setInsights([]);
			setInsightMessage(error instanceof Error ? error.message : "검색을 불러오지 못했습니다.");
		} finally {
			setInsightLoading(false);
		}
	};

	return (
		<div className="vn-concierge">
			<header className="vn-header">
				<a className="vn-brand" href="https://muhanai.com" aria-label="MuhanAI home">
					<span className="vn-brand-mark">M</span>
					<span>
						<strong>K-BizHub</strong>
						<small>powered by MuhanAI</small>
					</span>
				</a>
				<nav className="vn-nav" aria-label="주요 메뉴">
					<a href="#how">이용 방법</a>
					<a href="#services">생활 카테고리</a>
					<a href="#trust">데이터 출처</a>
				</nav>
				<div className="vn-header-actions">
					<button className="vn-language" type="button">
						<Languages size={15} /> KR <ChevronDown size={13} />
					</button>
					<a className="vn-outline-btn" href="https://muhanai.com/pythia">
						World AI 보기
					</a>
				</div>
			</header>

			<main>
				<section className="vn-hero">
					<div className="vn-hero-copy">
						<div className="vn-eyebrow">
							<span /> VIETNAM AI LIVING CONCIERGE
						</div>
						<h1>
							베트남 생활,
							<br />
							<span>AI가 먼저 찾아볼게요.</span>
						</h1>
						<p className="vn-hero-lead">
							베트남에서 살고, 여행하고, 사업하는 데 필요한 일을
							<br className="vn-desktop" /> AI가 찾아보고 비교해드립니다.
						</p>
						<div className="vn-hero-proof">
							<div className="vn-avatar-stack">
								<i>김</i>
								<i>J</i>
								<i>민</i>
								<i>＋</i>
							</div>
							<span>현지 데이터와 AI 에이전트가 함께 확인합니다</span>
						</div>
					</div>

					<div className="vn-orbit-card" aria-label="MuhanAI service network">
						<div className="vn-orbit-glow" />
						<div className="vn-orbit-center">
							<Sparkles size={21} />
							<b>AI</b>
							<span>CONCIERGE</span>
						</div>
						<div className="vn-orbit-node vn-orbit-node--north">
							<MapPin size={14} /> KBizLink
						</div>
						<div className="vn-orbit-node vn-orbit-node--east">
							<WalletCards size={14} /> FX2
						</div>
						<div className="vn-orbit-node vn-orbit-node--south">
							<Newspaper size={14} /> Insight
						</div>
						<div className="vn-orbit-node vn-orbit-node--west">
							<Building2 size={14} /> K-BizHub
						</div>
						<div className="vn-orbit-caption">현실 세계 데이터를 한 곳에서</div>
					</div>
				</section>

				<section className="vn-assistant-card" aria-label="AI concierge search">
					<div className="vn-assistant-topline">
						<div>
							<span className="vn-live-dot" /> 지금 무엇을 도와드릴까요?
						</div>
						<span>무료로 시작 · 회원가입 없이</span>
					</div>
					<form onSubmit={submitQuery}>
						<div className="vn-search-row">
							<Search size={21} />
							<input
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="예: 다낭에서 한 달 살 집과 생활비를 비교해줘"
								aria-label="AI에게 질문하기"
							/>
							<button type="submit">
								<ArrowRight size={18} /> 찾기
							</button>
						</div>
					</form>
					<div className="vn-suggestion-row">
						{EXAMPLES.map((example) => (
							<button key={example} type="button" onClick={() => setQuery(example)}>
								{example}
							</button>
						))}
					</div>
					{submitted && (
						<div className="vn-result-note">
							<Sparkles size={15} /> “{query}”를 기준으로 숙소·현지정보·환율을 함께 준비하고 있어요.
						</div>
					)}
					{insightLoading && (
						<div className="vn-insight-status">Naver에서 최신 베트남 정보를 찾는 중입니다…</div>
					)}
					{insightMessage && (
						<div className="vn-insight-status vn-insight-status--muted">{insightMessage}</div>
					)}
					{insights.length > 0 && (
						<div className="vn-insight-grid" aria-live="polite">
							{insights.map((item) => (
								<a
									className="vn-insight-card"
									href={item.url}
									target="_blank"
									rel="noreferrer"
									key={`${item.url}-${item.title}`}
								>
									<span>
										{item.source}
										{item.date ? ` · ${item.date}` : ""}
									</span>
									<strong>{item.title}</strong>
									<p>{item.description}</p>
									<small>
										원문 보기 <ArrowRight size={12} />
									</small>
								</a>
							))}
						</div>
					)}
				</section>

				<section className="vn-section" id="services">
					<div className="vn-section-heading">
						<div>
							<span className="vn-kicker">START WITH ONE THING</span>
							<h2>필요한 일을 골라보세요</h2>
						</div>
						<p>복잡한 검색은 AI가 뒤에서 연결합니다.</p>
					</div>
					<div className="vn-service-grid">
						{SERVICES.map(({ icon: Icon, label, detail }) => (
							<button
								key={label}
								type="button"
								className={`vn-service ${selectedService === label ? "is-selected" : ""}`}
								onClick={() => {
									setSelectedService(label);
									setQuery(`${label}에 대해 베트남 현지 기준으로 비교해줘`);
								}}
							>
								<span className="vn-service-icon">
									<Icon size={21} />
								</span>
								<span>
									<b>{label}</b>
									<small>{detail}</small>
								</span>
								<ArrowRight size={16} />
							</button>
						))}
					</div>
				</section>

				<section className="vn-how" id="how">
					<div className="vn-how-intro">
						<span className="vn-kicker">HOW IT WORKS</span>
						<h2>
							검색은 간단하게,
							<br />
							<em>확인은 꼼꼼하게.</em>
						</h2>
						<p>하나의 질문 뒤에서 여러 전문 에이전트가 움직입니다.</p>
					</div>
					<div className="vn-steps">
						<div>
							<strong>01</strong>
							<h3>말하듯 물어보세요</h3>
							<p>한국어, 영어, 베트남어로 편하게 질문하세요.</p>
						</div>
						<div>
							<strong>02</strong>
							<h3>여러 데이터를 비교해요</h3>
							<p>숙소·업소·뉴스·환율을 한 화면에서 확인합니다.</p>
						</div>
						<div>
							<strong>03</strong>
							<h3>결정은 내가 해요</h3>
							<p>출처와 기준을 보여드리고, 선택은 당신에게 맡깁니다.</p>
						</div>
					</div>
				</section>

				<section className="vn-trust" id="trust">
					<div className="vn-trust-icon">
						<ShieldCheck size={24} />
					</div>
					<div>
						<b>현지 정보는 출처와 함께 보여드립니다</b>
						<p>
							K-BizHub · KBizLink · Vietnam Insight · FX2 · Pythia가 각자의 전문 영역을 담당합니다.
						</p>
					</div>
					<a href="https://muhanai.com/dashboard2">
						Mesh Console <ArrowRight size={15} />
					</a>
				</section>
			</main>

			<footer className="vn-footer">
				<span>© 2026 K-BizHub · A MuhanAI service</span>
				<span>다낭에서 시작해, 베트남 전역으로</span>
			</footer>
		</div>
	);
};

export default VietnamConciergePage;
