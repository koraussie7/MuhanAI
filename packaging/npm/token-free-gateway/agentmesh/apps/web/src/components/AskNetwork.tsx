import type React from 'react';
import { useState } from 'react';

interface AskNetworkProps {
  onSubmit?: (question: string, targets: string[]) => void;
}

const TARGETS = [
  { id: 'ai', label: 'AI', icon: '🤖', description: 'LLM Models' },
  { id: 'agents', label: 'Agents', icon: '🕸️', description: 'Agent Mesh' },
  { id: 'human', label: 'Human', icon: '👤', description: 'Human Experts' },
  { id: 'web', label: 'Web', icon: '🌐', description: 'Web Search' },
  { id: 'knowledge', label: 'Knowledge', icon: '📚', description: 'Knowledge Base' },
];

export const AskNetwork: React.FC<AskNetworkProps> = ({ onSubmit }) => {
  const [question, setQuestion] = useState('');
  const [selectedTargets, setSelectedTargets] = useState<string[]>(['ai', 'agents', 'web']);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim() && onSubmit) {
      onSubmit(question.trim(), selectedTargets);
      setQuestion('');
    }
  };

  const toggleTarget = (targetId: string) => {
    setSelectedTargets(prev => 
      prev.includes(targetId)
        ? prev.filter(t => t !== targetId)
        : [...prev, targetId]
    );
  };

  return (
    <div className={`ask-network ${isExpanded ? 'expanded' : ''}`}>
      <form onSubmit={handleSubmit} className="ask-form">
        <div className="ask-input-wrapper">
          <label htmlFor="network-question" className="ask-label">
            <span className="label-icon">🌐</span>
            <span className="label-text">ASK NETWORK</span>
          </label>
          <div className="input-group">
            <textarea
              id="network-question"
              className="ask-textarea"
              placeholder="무엇이든 네트워크에 물어보세요..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onFocus={() => setIsExpanded(true)}
              onBlur={() => setTimeout(() => setIsExpanded(false), 200)}
              rows={isExpanded ? 3 : 1}
            />
            <button 
              type="submit" 
              className="btn-primary ask-submit-btn"
              disabled={!question.trim()}
            >
              보내기
            </button>
          </div>
        </div>

        <div className="ask-targets">
          <span className="targets-label">Route to:</span>
          <div className="target-chips">
            {TARGETS.map(target => (
              <button
                key={target.id}
                type="button"
                className={`target-chip ${selectedTargets.includes(target.id) ? 'selected' : ''}`}
                onClick={() => toggleTarget(target.id)}
                title={target.description}
              >
                <span className="chip-icon">{target.icon}</span>
                <span className="chip-label">{target.label}</span>
              </button>
            ))}
          </div>
        </div>

        {isExpanded && question.trim() && (
          <div className="ask-preview">
            <span className="preview-label">Will cast to:</span>
            <div className="preview-targets">
              {selectedTargets.map(id => {
                const target = TARGETS.find(t => t.id === id);
                return target ? (
                  <span key={id} className="preview-chip">
                    {target.icon} {target.label}
                  </span>
                ) : null;
              })}
            </div>
          </div>
        )}
      </form>
    </div>
  );
};