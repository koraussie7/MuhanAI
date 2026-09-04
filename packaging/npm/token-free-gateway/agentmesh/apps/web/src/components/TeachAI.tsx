import React, { useState } from 'react';

interface TeachAIProps {
  onSubmit?: (knowledge: string) => void;
}

export const TeachAI: React.FC<TeachAIProps> = ({ onSubmit }) => {
  const [knowledge, setKnowledge] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submittedKnowledge, setSubmittedKnowledge] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (knowledge.trim() && onSubmit) {
      onSubmit(knowledge.trim());
      setSubmittedKnowledge(knowledge.trim());
      setSubmitted(true);
      setKnowledge('');
    }
  };

  if (submitted) {
    return (
      <section className="teach-ai-section success-state">
        <div className="section-header">
          <h2 className="section-title">
            <span className="brain-icon">🧠</span>
            TEACH AI
          </h2>
        </div>
        
        <div className="knowledge-candidate">
          <div className="candidate-header">
            <span className="candidate-badge">Knowledge Candidate</span>
            <span className="candidate-source">Created by Human</span>
          </div>
          <div className="candidate-content">"{submittedKnowledge}"</div>
          <div className="candidate-meta">
            <span className="meta-item">
              <span className="meta-icon">📝</span>
              Sources: Personal Experience
            </span>
            <span className="meta-item">
              <span className="meta-icon">⏳</span>
              Verification Needed
            </span>
          </div>
          <div className="candidate-actions">
            <button className="btn-primary submit-knowledge-btn">Submit for Verification</button>
            <button className="btn-secondary teach-more-btn" onClick={() => setSubmitted(false)}>
              더 가르치기
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="teach-ai-section">
      <div className="section-header">
        <h2 className="section-title">
          <span className="brain-icon">🧠</span>
          TEACH AI
        </h2>
        <p className="section-subtitle">"AI에게 내가 아는 것을 가르치기"</p>
      </div>
      
      <form onSubmit={handleSubmit} className="teach-form">
        <textarea
          className="teach-textarea"
          placeholder={'예: "나는 미얀마에서 10년간 사업을 했는데... 현지에서 실제로 겪은 문제들은..."'}
          value={knowledge}
          onChange={(e) => setKnowledge(e.target.value)}
          rows={4}
        />
        <div className="teach-hint">
          경험, 노하우, 현장 정보, 검증된 팁 등 AI가 모를 수 있는 지식을 공유해주세요.
        </div>
        <button type="submit" className="btn-primary create-knowledge-btn" disabled={!knowledge.trim()}>
          Knowledge 생성
        </button>
      </form>
    </section>
  );
};