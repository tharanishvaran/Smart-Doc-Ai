import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { quizService } from '../services/quizService';
import LoadingSpinner from '../components/LoadingSpinner';
import { 
  FileText, 
  FolderOpen, 
  MessageSquare, 
  Bot, 
  UploadCloud, 
  ArrowRight, 
  CheckCircle2, 
  Clock, 
  Sparkles,
  TrendingUp,
  Award,
  AlertTriangle,
  Target
} from 'lucide-react';
import './Dashboard.css';

import { useAuth } from '../contexts/AuthContext';
import UserAvatar from '../components/UserAvatar';

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [quizStats, setQuizStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/dashboard'),
      quizService.getDashboardStats()
    ])
      .then(([dashRes, quizRes]) => {
        setData(dashRes.data.data);
        setQuizStats(quizRes.data.data);
      })
      .catch(() => setError('Failed to load dashboard data.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner message="Retrieving Student AI Dashboard & Performance Metrics..." />;
  if (error) return <div className="alert alert-error">{error}</div>;

  const { stats, recent_documents, recent_sessions, documents_by_category } = data;

  return (
    <div className="dashboard-wrapper animate-fade-in">
      {/* Dynamic Hero Banner */}
      <div className="hero-banner glass-card">
        <div className="hero-content">
          <div className="hero-tag">
            <Sparkles size={14} />
            <span>AI Student Learning Platform</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8, flexWrap: 'wrap' }}>
            <UserAvatar 
              user={user} 
              size={48} 
              fontSize="1.3rem"
              border="3px solid var(--primary)" 
            />
            <h1 style={{ margin: 0 }}>
              Welcome back, <span className="page-title-gradient">{user?.name || 'Student'}</span>
            </h1>
          </div>
          <p>Multi-document RAG assistant, automated exam prep, AI practice quizzes, and weakness analytics.</p>


          <div className="hero-actions">
            <Link to="/exam-prep" className="btn btn-primary">
              <Target size={18} />
              <span>Exam Prep Hub</span>
            </Link>
            <Link to="/quiz" className="btn btn-accent">
              <Award size={18} />
              <span>AI Quiz Mode</span>
            </Link>
            <Link to="/documents" className="btn btn-secondary">
              <UploadCloud size={18} />
              <span>Upload Materials</span>
            </Link>
          </div>
        </div>
        <div className="hero-glow-orb" />
      </div>

      {/* Student Quiz Performance Dashboard */}
      {quizStats && (
        <div className="dashboard-section glass-card" style={{ padding: 24, marginBottom: 24 }}>
          <div className="section-header" style={{ marginBottom: 20 }}>
            <div className="section-title">
              <Award size={22} className="section-icon text-primary" />
              <h3>Student Performance & Topic Mastery Dashboard</h3>
            </div>
            <Link to="/quiz" className="btn btn-ghost btn-sm">
              <span>Take Quiz</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          <div className="grid-3" style={{ marginBottom: 24 }}>
            <div className="stat-card glass-card">
              <div className="stat-body">
                <div className="stat-value">{quizStats.questions_attempted ?? 0}</div>
                <div className="stat-label">Questions Attempted</div>
                <div className="stat-subtext">Across practice quizzes</div>
              </div>
            </div>

            <div className="stat-card glass-card">
              <div className="stat-body">
                <div className="stat-value text-success">{quizStats.correct_questions ?? 0}</div>
                <div className="stat-label">Correct Answers</div>
                <div className="stat-subtext">Verified responses</div>
              </div>
            </div>

            <div className="stat-card glass-card">
              <div className="stat-body">
                <div className="stat-value text-primary">{quizStats.accuracy ?? 0}%</div>
                <div className="stat-label">Overall Accuracy</div>
                <div className="stat-subtext">Mastery rating</div>
              </div>
            </div>
          </div>

          <div className="grid-2">
            {/* Strong Topics Graph Visualization */}
            <TopicPerformanceGraph
              title="Strong Topics Mastery Graph"
              subtitle="Consistently high scoring conceptual areas"
              items={quizStats.strong_topics || []}
              type="strong"
              emptyText="No strong topics recorded yet. Take an AI Quiz to plot your mastery graph!"
            />

            {/* Weak Topics Graph Visualization */}
            <TopicPerformanceGraph
              title="Weak Topics Identified Graph"
              subtitle="Target threshold: 70% - review recommended"
              items={quizStats.weak_topics || []}
              type="weak"
              emptyText="No weak topics identified! Keep taking quizzes to test your limits."
            />
          </div>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="grid-4 metric-grid">
        <div className="stat-card glass-card card-hover">
          <div className="stat-card-header">
            <div className="stat-icon-wrapper primary-glow-icon">
              <FileText size={22} />
            </div>
            <span className="stat-trend positive">
              <TrendingUp size={12} /> Active
            </span>
          </div>
          <div className="stat-body">
            <div className="stat-value">{stats.total_documents}</div>
            <div className="stat-label">Total Documents</div>
            <div className="stat-subtext">
              <CheckCircle2 size={12} className="check-icon" />
              <span>{stats.completed_documents} processed</span>
            </div>
          </div>
        </div>

        <div className="stat-card glass-card card-hover">
          <div className="stat-card-header">
            <div className="stat-icon-wrapper accent-glow-icon">
              <FolderOpen size={22} />
            </div>
            <span className="stat-trend positive">Indexed</span>
          </div>
          <div className="stat-body">
            <div className="stat-value">{stats.total_categories}</div>
            <div className="stat-label">Categories</div>
            <div className="stat-subtext">Automated classification</div>
          </div>
        </div>

        <div className="stat-card glass-card card-hover">
          <div className="stat-card-header">
            <div className="stat-icon-wrapper purple-glow-icon">
              <MessageSquare size={22} />
            </div>
            <span className="stat-trend positive">Conversational</span>
          </div>
          <div className="stat-body">
            <div className="stat-value">{stats.total_chat_sessions}</div>
            <div className="stat-label">Chat Sessions</div>
            <div className="stat-subtext">AI interactions</div>
          </div>
        </div>

        <div className="stat-card glass-card rag-banner-card card-hover">
          <div className="rag-card-bg-glow" />
          <div className="stat-card-header">
            <div className="stat-icon-wrapper white-glow-icon">
              <Bot size={22} />
            </div>
            <span className="badge badge-primary">RAG Engine</span>
          </div>
          <div className="stat-body">
            <div className="stat-value text-white">Smart RAG</div>
            <div className="stat-label text-white-80">Multi-format Search</div>
            <Link to="/chat" className="rag-launch-btn btn btn-sm">
              <span>Chat Now</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content 2-Column Split */}
      <div className="grid-2 dashboard-main-grid">
        {/* Recent Documents Card */}
        <div className="dashboard-section glass-card">
          <div className="section-header">
            <div className="section-title">
              <FileText size={20} className="section-icon" />
              <h3>Recent Materials</h3>
            </div>
            <Link to="/documents" className="btn btn-ghost btn-sm">
              <span>View All</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          {recent_documents.length === 0 ? (
            <div className="empty-dashboard-state">
              <FolderOpen size={40} className="empty-icon" />
              <p>No documents uploaded yet.</p>
              <Link to="/documents" className="btn btn-primary btn-sm">Upload Study Material</Link>
            </div>
          ) : (
            <div className="recent-list">
              {recent_documents.map(doc => (
                <div key={doc.id} className="recent-item-card">
                  <div className="file-type-icon">
                    <FileText size={18} />
                  </div>
                  <div className="recent-item-info">
                    <div className="recent-item-name">{doc.original_filename}</div>
                    <div className="recent-item-meta">
                      {doc.category_name && (
                        <span className="badge badge-primary">{doc.category_name}</span>
                      )}
                      <span className={`badge ${
                        ['indexed', 'completed'].includes(doc.upload_status?.toLowerCase()) ? 'badge-success' : 
                        doc.upload_status?.toLowerCase() === 'failed' ? 'badge-danger' : 'badge-warning'
                      }`}>
                        {doc.upload_status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Chat Sessions Card */}
        <div className="dashboard-section glass-card">
          <div className="section-header">
            <div className="section-title">
              <MessageSquare size={20} className="section-icon" />
              <h3>Recent Conversations</h3>
            </div>
            <Link to="/chat" className="btn btn-ghost btn-sm">
              <span>New Chat</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          {recent_sessions.length === 0 ? (
            <div className="empty-dashboard-state">
              <MessageSquare size={40} className="empty-icon" />
              <p>No chat history available.</p>
              <Link to="/chat" className="btn btn-accent btn-sm">Ask Question</Link>
            </div>
          ) : (
            <div className="recent-list">
              {recent_sessions.map(session => (
                <Link key={session.id} to={`/chat/${session.id}`} className="recent-item-card chat-session-link">
                  <div className="file-type-icon chat-icon">
                    <MessageSquare size={18} />
                  </div>
                  <div className="recent-item-info">
                    <div className="recent-item-name">{session.title}</div>
                    <div className="recent-item-meta">
                      <span className="meta-text">
                        <Clock size={12} /> {session.message_count} messages
                      </span>
                    </div>
                  </div>
                  <ArrowRight size={16} className="item-arrow" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RadialGauge({ percentage, color, glowColor, size = 52, strokeWidth = 5 }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(percentage || 0, 0), 100);
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <div className="topic-radial-wrapper" style={{ width: size, height: size }} title={`Average: ${clamped}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="topic-radial-svg">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={strokeWidth}
          opacity="0.35"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
            filter: `drop-shadow(0 0 6px ${glowColor})`,
            transform: 'rotate(-90deg)',
            transformOrigin: '50% 50%',
          }}
        />
      </svg>
      <div className="topic-radial-label" style={{ color }}>
        {Math.round(clamped)}%
      </div>
    </div>
  );
}

function TopicPerformanceGraph({ title, subtitle, items = [], type = 'strong', emptyText }) {
  const isStrong = type === 'strong';
  const avgAccuracy = items.length > 0 
    ? Math.round(items.reduce((acc, curr) => acc + (curr.accuracy || 0), 0) / items.length)
    : 0;

  const color = isStrong ? '#10b981' : '#ef4444';
  const glowColor = isStrong ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)';

  return (
    <div className="topic-analytics-card">
      <div className="topic-analytics-header">
        <div className="topic-analytics-title-group">
          <h4 className={`topic-analytics-title ${isStrong ? 'topic-title-strong' : 'topic-title-weak'}`}>
            {isStrong ? <TrendingUp size={18} /> : <AlertTriangle size={18} />}
            <span>{title}</span>
          </h4>
          <span className="topic-analytics-subtitle">
            {subtitle || (isStrong ? `${items.length} High-performance topic(s)` : `${items.length} Topic(s) below target threshold`)}
          </span>
        </div>

        {items.length > 0 && (
          <RadialGauge 
            percentage={avgAccuracy} 
            color={color} 
            glowColor={glowColor} 
          />
        )}
      </div>

      {/* Axis ruler */}
      <div className="topic-graph-axis">
        <span className="topic-graph-axis-mark">0%</span>
        <span className="topic-graph-axis-mark">25%</span>
        <span className="topic-graph-axis-mark">50%</span>
        <span className="topic-graph-axis-mark">75%</span>
        <span className="topic-graph-axis-mark">100%</span>
      </div>

      {/* Graph Items List */}
      <div className="topic-graph-list">
        {items.length === 0 ? (
          <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            {emptyText || (isStrong ? 'No strong topics recorded yet. Take an AI Quiz!' : 'No weak topics identified. Excellent work!')}
          </div>
        ) : (
          items.map((item, idx) => {
            const acc = Math.min(Math.max(item.accuracy ?? 0, 0), 100);
            let status = 'Mastered';
            let badgeClass = 'badge-success';

            if (!isStrong) {
              if (acc < 40) {
                status = 'Critical Gap';
                badgeClass = 'badge-danger';
              } else {
                status = 'Needs Review';
                badgeClass = 'badge-warning';
              }
            }

            return (
              <div key={idx} className="topic-bar-row">
                <div className="topic-bar-meta">
                  <div className="topic-bar-title-group">
                    <span className={`topic-bar-icon-pip ${isStrong ? 'pip-strong' : 'pip-weak'}`}>
                      {isStrong ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                    </span>
                    <span className="topic-bar-name" title={item.topic}>{item.topic}</span>
                    {item.attempts && (
                      <span className="topic-bar-attempts">
                        ({item.attempts} {item.attempts === 1 ? 'quiz' : 'quizzes'})
                      </span>
                    )}
                  </div>
                  <div className="topic-bar-score-group">
                    <span className={`badge ${badgeClass} topic-bar-badge`}>{status}</span>
                    <span className="topic-bar-percent" style={{ color }}>
                      {item.accuracy}%
                    </span>
                  </div>
                </div>

                <div className="topic-bar-track-outer">
                  <div className="topic-bar-gridline tick-25" />
                  <div className="topic-bar-gridline tick-50" />
                  <div className="topic-bar-gridline tick-75" />
                  <div 
                    className={`topic-bar-fill ${isStrong ? 'fill-strong' : 'fill-weak'}`}
                    style={{ width: `${acc}%` }}
                  >
                    <div className="topic-bar-shimmer" />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Card Action Footer */}
      <div className="topic-graph-footer">
        <span>{isStrong ? 'Consistently high test accuracy' : 'Target threshold: 70% accuracy'}</span>
        {isStrong ? (
          <Link to="/exam-prep" className="topic-quick-action-btn btn-strong-explore">
            <span>Exam Questions</span>
            <ArrowRight size={12} />
          </Link>
        ) : (
          <Link to="/quiz" className="topic-quick-action-btn btn-weak-practice">
            <span>Practice Weak Topics</span>
            <ArrowRight size={12} />
          </Link>
        )}
      </div>
    </div>
  );
}
