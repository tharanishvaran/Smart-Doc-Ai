import { useState, useEffect, useRef } from 'react';
import { examPrepService } from '../services/examPrepService';
import LoadingSpinner from '../components/LoadingSpinner';
import SectionLoadingCard from '../components/SectionLoadingCard';
import { 
  Target, 
  Calendar, 
  Flame, 
  FileText, 
  HelpCircle, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle
} from 'lucide-react';

const STORAGE_KEY = 'examprep_session_state';

const getInitialState = () => {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
};

export default function ExamPrep() {
  const savedState = useRef(getInitialState()).current;

  const [activeTab, setActiveTab] = useState(savedState?.activeTab || 'strategy');
  const [subject, setSubject] = useState(savedState?.subject || '');
  const [unit, setUnit] = useState(savedState?.unit || '');
  const [examType, setExamType] = useState(savedState?.examType || 'Semester Final');
  const [daysRemaining, setDaysRemaining] = useState(savedState?.daysRemaining ?? 10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Results state
  const [strategyResult, setStrategyResult] = useState(savedState?.strategyResult || '');
  const [studyPlanResult, setStudyPlanResult] = useState(savedState?.studyPlanResult || null);
  const [importantTopicsResult, setImportantTopicsResult] = useState(savedState?.importantTopicsResult || null);
  const [paperAnalysisResult, setPaperAnalysisResult] = useState(savedState?.paperAnalysisResult || '');
  const [expectedQuestionsResult, setExpectedQuestionsResult] = useState(savedState?.expectedQuestionsResult || '');

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        activeTab,
        subject,
        unit,
        examType,
        daysRemaining,
        strategyResult,
        studyPlanResult,
        importantTopicsResult,
        paperAnalysisResult,
        expectedQuestionsResult,
      }));
    } catch {}
  }, [
    activeTab,
    subject,
    unit,
    examType,
    daysRemaining,
    strategyResult,
    studyPlanResult,
    importantTopicsResult,
    paperAnalysisResult,
    expectedQuestionsResult,
  ]);

  const handleGenerateStrategy = async () => {
    if (!subject.trim()) { setError('Please enter a subject name.'); return; }
    setError(''); setLoading(true);
    try {
      const res = await examPrepService.getStrategy({
        subject, unit, exam_type: examType, days_remaining: daysRemaining
      });
      setStrategyResult(res.data.data.strategy);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate strategy.');
    } finally { setLoading(false); }
  };

  const handleGenerateStudyPlan = async () => {
    if (!subject.trim()) { setError('Please enter a subject name.'); return; }
    setError(''); setLoading(true);
    try {
      const res = await examPrepService.getStudyPlan({ subject, days_remaining: daysRemaining });
      setStudyPlanResult(res.data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate study plan.');
    } finally { setLoading(false); }
  };

  const handleDetectTopics = async () => {
    if (!subject.trim()) { setError('Please enter a subject name.'); return; }
    setError(''); setLoading(true);
    try {
      const res = await examPrepService.getImportantTopics({ subject });
      setImportantTopicsResult(res.data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to analyze topics.');
    } finally { setLoading(false); }
  };

  const handlePaperAnalysis = async () => {
    if (!subject.trim()) { setError('Please enter a subject name.'); return; }
    setError(''); setLoading(true);
    try {
      const res = await examPrepService.getPaperAnalysis({ subject });
      setPaperAnalysisResult(res.data.data.analysis);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to analyze previous papers.');
    } finally { setLoading(false); }
  };

  const handleExpectedQuestions = async () => {
    if (!subject.trim()) { setError('Please enter a subject name.'); return; }
    setError(''); setLoading(true);
    try {
      const res = await examPrepService.getExpectedQuestions({ subject });
      setExpectedQuestionsResult(res.data.data.expected_questions);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to predict expected questions.');
    } finally { setLoading(false); }
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="page-header">
        <h1>🎯 Exam Preparation & Strategy Hub</h1>
        <p>AI-driven exam strategies, study planners, topic priorities, and predicted questions from your uploaded syllabus.</p>
      </div>

      {/* Tabs */}
      <div className="mode-selector glass-card" style={{ padding: '8px 10px', marginBottom: 20 }}>
        <button 
          className={`mode-pill ${activeTab === 'strategy' ? 'active' : ''}`}
          onClick={() => setActiveTab('strategy')}
        >
          <Target size={16} /> Exam Strategy
        </button>
        <button 
          className={`mode-pill ${activeTab === 'planner' ? 'active' : ''}`}
          onClick={() => setActiveTab('planner')}
        >
          <Calendar size={16} /> AI Study Planner
        </button>
        <button 
          className={`mode-pill ${activeTab === 'topics' ? 'active' : ''}`}
          onClick={() => setActiveTab('topics')}
        >
          <Flame size={16} /> Important Topics
        </button>
        <button 
          className={`mode-pill ${activeTab === 'papers' ? 'active' : ''}`}
          onClick={() => setActiveTab('papers')}
        >
          <FileText size={16} /> Previous Paper Analysis
        </button>
        <button 
          className={`mode-pill ${activeTab === 'expected' ? 'active' : ''}`}
          onClick={() => setActiveTab('expected')}
        >
          <HelpCircle size={16} /> Expected Questions
        </button>
      </div>

      {/* Form Card */}
      <div className="glass-card" style={{ padding: 20, marginBottom: 24 }}>
        <div className="grid-2" style={{ marginBottom: 16 }}>
          <div className="input-group">
            <label className="input-label">Subject / Course Name</label>
            <input 
              className="input" 
              placeholder="e.g. Data Structures & Algorithms, DBMS, Operating Systems"
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Unit / Module (Optional)</label>
            <input 
              className="input" 
              placeholder="e.g. Unit 3 - Normalization & Indexing"
              value={unit}
              onChange={e => setUnit(e.target.value)}
            />
          </div>
        </div>

        <div className="grid-2" style={{ marginBottom: 20 }}>
          <div className="input-group">
            <label className="input-label">Exam Type</label>
            <select className="input" value={examType} onChange={e => setExamType(e.target.value)}>
              <option value="Midterm Exam">Midterm / Internal Exam</option>
              <option value="Semester Final">Semester Final Exam</option>
              <option value="Quiz / Assessment">Class Quiz / Assessment</option>
              <option value="Lab Practical">Lab Practical Exam</option>
            </select>
          </div>

          <div className="input-group">
            <label className="input-label">Days Remaining</label>
            <input 
              type="number" 
              className="input" 
              min="1" 
              max="90"
              value={daysRemaining}
              onChange={e => setDaysRemaining(parseInt(e.target.value) || 1)}
            />
          </div>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>⚠️ {error}</div>}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {activeTab === 'strategy' && (
            <button className="btn btn-primary" onClick={handleGenerateStrategy} disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? <Sparkles className="spin" size={16} /> : <Target size={16} />}
              <span>Generate Preparation Strategy</span>
            </button>
          )}

          {activeTab === 'planner' && (
            <button className="btn btn-primary" onClick={handleGenerateStudyPlan} disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? <Sparkles className="spin" size={16} /> : <Calendar size={16} />}
              <span>Create Day-by-Day Study Plan</span>
            </button>
          )}

          {activeTab === 'topics' && (
            <button className="btn btn-primary" onClick={handleDetectTopics} disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? <Sparkles className="spin" size={16} /> : <Flame size={16} />}
              <span>Detect Priority Topics</span>
            </button>
          )}

          {activeTab === 'papers' && (
            <button className="btn btn-primary" onClick={handlePaperAnalysis} disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? <Sparkles className="spin" size={16} /> : <FileText size={16} />}
              <span>Analyze Previous Papers</span>
            </button>
          )}

          {activeTab === 'expected' && (
            <button className="btn btn-primary" onClick={handleExpectedQuestions} disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? <Sparkles className="spin" size={16} /> : <HelpCircle size={16} />}
              <span>Predict Expected Questions</span>
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div style={{ margin: '20px 0' }}>
          <SectionLoadingCard 
            theme="examprep" 
            mode="action" 
            title={
              activeTab === 'strategy' ? 'Synthesizing Personalized Exam Preparation Strategy...' :
              activeTab === 'planner' ? `Formulating ${daysRemaining}-Day Adaptive AI Study Schedule...` :
              activeTab === 'topics' ? 'Mining Priority & High-Yield Exam Topics...' :
              activeTab === 'papers' ? 'Analyzing Historical Question Paper Trends...' :
              'Predicting High-Probability Exam Questions...'
            }
          />
        </div>
      )}

      {/* Results Display */}
      {activeTab === 'strategy' && strategyResult && (
        <div className="glass-card animate-fade-in" style={{ padding: 22, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
          <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Target size={20} className="text-primary" /> Personalized Exam Preparation Strategy
          </h3>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: '0.94rem' }}>{strategyResult}</div>
        </div>
      )}

      {activeTab === 'planner' && studyPlanResult && (
        <div className="glass-card animate-fade-in" style={{ padding: 22, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
          <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={20} className="text-primary" /> {studyPlanResult.total_days}-Day AI Study Schedule ({studyPlanResult.subject})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {studyPlanResult.plan?.map((item, idx) => (
              <div key={idx} className="glass-card" style={{ padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <span className="badge badge-primary" style={{ marginRight: 10 }}>Day {item.day}</span>
                  <strong>{item.focus}</strong>
                  <ul style={{ margin: '8px 0 0 20px', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                    {item.activities?.map((act, i) => <li key={i}>{act}</li>)}
                  </ul>
                </div>
                <span className="badge badge-success"><CheckCircle2 size={12} /> Adaptable</span>
              </div>
            ))}
          </div>
          {studyPlanResult.recommendation && (
            <div className="alert alert-success" style={{ marginTop: 20 }}>
              💡 {studyPlanResult.recommendation}
            </div>
          )}
        </div>
      )}

      {activeTab === 'topics' && importantTopicsResult && (
        <div className="grid-3 animate-fade-in">
          <div className="glass-card" style={{ padding: 24 }}>
            <h4 style={{ color: '#ef4444', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Flame size={18} /> 🔥 High Priority
            </h4>
            {importantTopicsResult.high_priority?.map((t, i) => (
              <div key={i} style={{ marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                <strong style={{ color: 'var(--text-main)', fontSize: '0.96rem', display: 'block' }}>{t.topic}</strong>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>{t.reason}</p>
              </div>
            ))}
          </div>

          <div className="glass-card" style={{ padding: 24 }}>
            <h4 style={{ color: '#f59e0b', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={18} /> 🟡 Medium Priority
            </h4>
            {importantTopicsResult.medium_priority?.map((t, i) => (
              <div key={i} style={{ marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                <strong style={{ color: 'var(--text-main)', fontSize: '0.96rem', display: 'block' }}>{t.topic}</strong>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>{t.reason}</p>
              </div>
            ))}
          </div>

          <div className="glass-card" style={{ padding: 24 }}>
            <h4 style={{ color: '#10b981', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={18} /> 🟢 Low Priority
            </h4>
            {importantTopicsResult.low_priority?.map((t, i) => (
              <div key={i} style={{ marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                <strong style={{ color: 'var(--text-main)', fontSize: '0.96rem', display: 'block' }}>{t.topic}</strong>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>{t.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'papers' && paperAnalysisResult && (
        <div className="glass-card animate-fade-in" style={{ padding: 28 }}>
          <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={20} className="text-primary" /> Previous Question Paper Insights
          </h3>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{paperAnalysisResult}</div>
        </div>
      )}

      {activeTab === 'expected' && expectedQuestionsResult && (
        <div className="glass-card animate-fade-in" style={{ padding: 28 }}>
          <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <HelpCircle size={20} className="text-primary" /> AI-Predicted Expected Questions
          </h3>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{expectedQuestionsResult}</div>
        </div>
      )}
    </div>
  );
}
