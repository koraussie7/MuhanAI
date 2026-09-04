import React from 'react';
import { TRENDING_QUESTIONS } from '../data/mockData';

interface TrendingQuestion {
  id: string;
  topic: string;
  participants: number;
  score: number;
  trend?: 'up' | 'down' | 'stable';
}

interface TrendingQuestionsProps {
  questions?: TrendingQuestion[];
  maxItems?: number;
}

export const TrendingQuestions: React.FC<TrendingQuestionsProps> = ({
  questions = TRENDING_QUESTIONS,
  maxItems = 5
}) => {
  const sortedQuestions = [...questions]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems);

  const getBarWidth = (participants: number, max: number) => {
    return Math.min((participants / max) * 100, 100);
  };

  const maxParticipants = Math.max(...sortedQuestions.map(q => q.participants));

  return (
    <section className="trending-questions-section">
      <div className="section-header">
        <h2 className="section-title">
          <span className="fire-icon">🔥</span>
          TRENDING QUESTIONS
        </h2>
      </div>
      <div className="trending-list">
        {sortedQuestions.map((question, index) => (
          <div key={question.id} className="trending-item">
            <div className="trending-rank">#{index + 1}</div>
            <div className="trending-info">
              <div className="trending-topic">{question.topic}</div>
              <div className="trending-bar-container">
                <div
                  className="trending-bar"
                  style={{ width: `${getBarWidth(question.participants, maxParticipants)}%` }}
                ></div>
              </div>
            </div>
            <div className="trending-stats">
              <span className="participant-count">{question.participants.toLocaleString()}</span>
              <span className="trend-indicator {question.trend}">
                {question.trend === 'up' ? '↑' : question.trend === 'down' ? '↓' : '→'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};