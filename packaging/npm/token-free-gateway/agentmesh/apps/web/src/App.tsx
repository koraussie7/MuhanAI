import { AgentCast } from "./components/AgentCast";

const features = [
  { icon: "✦", title: "여러 AI의 시선", text: "여러 모델의 관점을 모아 더 넓게 생각합니다." },
  { icon: "◈", title: "검증 가능한 지식", text: "답변의 근거와 신뢰도를 함께 확인합니다." },
  { icon: "⌁", title: "나만의 AI 네트워크", text: "로컬 AI부터 전문가까지 필요한 에이전트를 연결합니다." },
];

export function App() {
  return (
    <div className="site-shell">
      <nav className="nav"><a className="brand" href="/"><span className="brand-mark">m</span><span>muhanai</span></a><div className="nav-links"><a href="#how">How it works</a><a href="#network">Network</a><a className="nav-cta" href="#ask">시작하기 <span>↗</span></a></div></nav>
      <main>
        <section className="hero"><div className="hero-copy"><div className="status-pill"><span className="pulse" /> AI가 연결되어 있습니다</div><h1>혼자 묻지 마세요.<br /><em>함께 생각</em>하세요.</h1><p className="hero-lede">muhanai는 다양한 AI와 사람이 함께 답을 찾는<br className="desktop-break" /> 지식 네트워크입니다.</p><div className="hero-actions"><a className="primary-button" href="#ask">질문 시작하기 <span>→</span></a><a className="text-link" href="#how">어떻게 작동하나요? <span>↓</span></a></div></div><div className="hero-orbit" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit orbit-three" /><div className="orbit-core">m<span>✦</span></div><div className="node node-a">✦</div><div className="node node-b">◈</div><div className="node node-c">AI</div><div className="node node-d">⌁</div></div></section>
        <section className="stats"><div><strong>24/7</strong><span>항상 열려있는 네트워크</span></div><div><strong>∞</strong><span>연결 가능한 에이전트</span></div><div><strong>100%</strong><span>투명한 답변 과정</span></div></section>
        <section id="ask" className="ask-section"><div className="section-heading"><span className="section-label">01 / ASK THE NETWORK</span><h2>좋은 질문은<br /><em>더 나은 답</em>을 만듭니다.</h2></div><AgentCast /></section>
        <section id="how" className="feature-section"><div className="section-heading compact"><span className="section-label">02 / WHY MUHANAI</span><h2>AI를 넘어,<br /><em>지식의 네트워크</em>로.</h2></div><div className="feature-grid">{features.map((feature) => <article className="feature-card" key={feature.title}><span className="feature-icon">{feature.icon}</span><h3>{feature.title}</h3><p>{feature.text}</p><span className="card-arrow">↗</span></article>)}</div></section>
      </main>
      <footer><a className="brand" href="/"><span className="brand-mark">m</span><span>muhanai</span></a><span>지식을 함께 만드는 네트워크</span><span className="footer-copy">© 2025 muhanai</span></footer>
    </div>
  );
}
