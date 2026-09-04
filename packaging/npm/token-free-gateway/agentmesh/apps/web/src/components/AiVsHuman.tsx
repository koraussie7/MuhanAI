import React from 'react';
import { AI_VS_HUMAN } from '../data/mockData';

interface AiVsHumanItem {
  id: string;
  question: string;
  aiConsensus: number;
  humanConsensus: number;
  winner: 'AI' | 'HUMAN' | 'TIE';
  participants: { ai: number; human: number };
  tags: string[];
}

interface AiVsHumanProps {
  items?: AiVsHumanItem[];
  maxItems?: number;
}

export const AiVsHuman: React.FC<AiVsHumanProps> = ({
  items = AI_VS_HUMAN,
  maxItems = 2
}) => {
  return (
    <section className="ai-vs-human-section">
      <div className="section-header">
        <h2 className="section-title">
          <span className="versus-icon">⚔️</span>
          AI vs HUMAN
        </h2>
      </div>

      <div className="versus-list">
        {items.slice(0, maxItems).map(item => (
          <article key={item.id} className="versus-card">
            <div className="versus-question">"{item.question}"</div>
            
            <div className="versus-bars">
              <div className="bar-group ai-bar-group">
                <div className="bar-label">
                  <span className="bar-icon">🤖</span>
                  <span>AI Consensus</span>
                  <span className="bar-value">{item.aiConsensus}%</span>
                </div>
                <div className="bar-track">
                  <div 
                    className="bar-fill ai-fill" 
                    style={{ width: `${item.aiConsensus}%` }}
                  ></div>
                </div>
                <div className="bar-participants">{item.participants.ai} agents</div>
              </div>

              <div className="bar-group human-bar-group">
                <div className="bar-label">
                  <span className="bar-icon">👤</span>
                  <span>Human Consensus</span>
                  <span className="bar-value">{item.humanConsensus}%</span>
                </div>
                <div className="bar-track">
                  <div 
                    className="bar-fill human-fill" 
                    style={{ width: `${item.humanConsensus}%` }}
                  ></div>
                </div>
                <div className="bar-participants">{item.participants.human} experts</div>
              </div>
            </div>

            <div className="versus-result">
              <div className="winner-badge">
                <span className="winner-label">Winner</span>
                <span className={`winner-value ${item.winner.toLowerCase()}`}>
                  {item.winner === 'AI' ? '🤖 AI' : item.winner === 'HUMAN' ? '👤 HUMAN' : '🤝 TIE'}
                </span>
              </div>
              <button className="btn-secondary view-result-btn">결과 보기</button>
            </div>

            <div className="versus-tags">
              {item.tags.map(tag => (
                <span key={tag} className="tag">{tag}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};