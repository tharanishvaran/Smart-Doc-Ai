import { useState, useEffect, useRef } from 'react';
import { documentService } from '../services/documentService';
import api from '../services/api';
import SectionLoadingCard from '../components/SectionLoadingCard';
import { 
  Search, 
  Sparkles, 
  FileText, 
  CheckSquare, 
  TrendingUp, 
  AlertTriangle, 
  ListChecks,
  ArrowRight,
  Layers,
  Copy,
  Check,
  BookOpen
} from 'lucide-react';
import './QuestionAnalysis.css';

const STORAGE_KEY = 'analysis_session_state';

const getInitialState = () => {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
};

export default function QuestionAnalysis() {
  const savedState = useRef(getInitialState()).current;

  const [documents, setDocuments] = useState([]);
  const [selected, setSelected] = useState(savedState?.selected || []);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(savedState?.result || null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('topics'); // 'topics' | 'documents'
  const [copiedDoc, setCopiedDoc] = useState(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        selected,
        result,
      }));
    } catch {}
  }, [selected, result]);

  useEffect(() => {
    documentService.getAll()
      .then(res => {
        const allDocs = res.data.data.documents || [];
        setDocuments(allDocs.filter(d => ['indexed', 'completed'].includes(d.upload_status?.toLowerCase())));
      })
      .catch(() => setError('Failed to retrieve document repository.'))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id) => setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const selectAll = () => {
    if (selected.length === documents.length) {
      setSelected([]);
    } else {
      setSelected(documents.map(d => d.id));
    }
  };

  const analyze = async () => {
    if (selected.length === 0) return setError('Please select at least one document to analyze.');
    setError(''); 
    setAnalyzing(true); 
    setResult(null);
    try {
      const res = await api.post('/dashboard/analyze', { document_ids: selected });
      setResult(res.data.data);
      setActiveTab('topics');
    } catch (err) {
      setError(err.response?.data?.error || 'Analysis failed. Please try again.');
    } finally { 
      setAnalyzing(false); 
    }
  };

  const copyDocQuestions = (docName, questions) => {
    const text = `Document: ${docName}\n\n` + questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedDoc(docName);
    setTimeout(() => setCopiedDoc(null), 2000);
  };

  return (
    <div className="analysis-page animate-fade-in">
      <div className="page-header">
        <h1>Question Paper & Topic Analysis</h1>
        <p>Extract recurring exam topics, question patterns, and exact questions across your question papers.</p>
      </div>

      <div className="grid-2 analysis-grid">
        {/* Document Checklist Panel */}
        <div className="checklist-panel glass-card">
          <div className="panel-header">
            <div className="panel-title">
              <CheckSquare size={20} className="text-primary" />
              <h3>Select Target Documents</h3>
            </div>
            <div className="panel-actions-header">
              {documents.length > 0 && (
                <button 
                  type="button" 
                  className="btn btn-ghost btn-xs select-all-btn" 
                  onClick={selectAll}
                >
                  {selected.length === documents.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
              <span className="badge badge-primary">{selected.length} selected</span>
            </div>
          </div>

          <p className="panel-subtitle">Select question papers or lecture notes to extract repeated exam questions.</p>

          {loading ? (
            <div style={{ padding: '8px 0' }}>
              <SectionLoadingCard theme="analysis" mode="initial" title="Scanning Document Repositories..." />
            </div>
          ) : documents.length === 0 ? (
            <div className="empty-checklist">
              <FileText size={40} className="empty-icon" />
              <p>No completed documents found in repository.</p>
            </div>
          ) : (
            <div className="doc-checklist">
              {documents.map(doc => (
                <label 
                  key={doc.id} 
                  className={`doc-check-item glass-card ${selected.includes(doc.id) ? 'checked' : ''}`}
                >
                  <input 
                    type="checkbox" 
                    checked={selected.includes(doc.id)} 
                    onChange={() => toggle(doc.id)} 
                  />
                  <div className="doc-check-icon">
                    <FileText size={18} />
                  </div>
                  <div className="doc-check-info">
                    <div className="doc-check-name" title={doc.original_filename}>{doc.original_filename}</div>
                    {doc.category_name && (
                      <span className="badge badge-primary badge-sm">{doc.category_name}</span>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}

          {error && <div className="alert alert-error" style={{ marginTop: 16 }}>⚠️ {error}</div>}

          <button
            className="btn btn-primary analyze-submit-btn"
            onClick={analyze}
            disabled={analyzing || selected.length === 0}
          >
            {analyzing ? (
              <>
                <Sparkles className="spin" size={18} />
                <span>Running AI Deep Analysis...</span>
              </>
            ) : (
              <>
                <Search size={18} />
                <span>Analyze Selected Papers</span>
              </>
            )}
          </button>
        </div>

        {/* Results Panel */}
        <div className="results-panel">
          {!result && !analyzing && (
            <div className="empty-results glass-card">
              <Sparkles size={48} className="empty-icon text-primary" />
              <h3>Intelligence Insights Ready</h3>
              <p>Select your question papers on the left and click "Analyze Selected Papers" to extract exact questions and repeated exam topics.</p>
            </div>
          )}

          {analyzing && (
            <div style={{ margin: '16px 0' }}>
              <SectionLoadingCard 
                theme="analysis" 
                mode="action" 
                title="Mining Exact Questions & Cross-Paper Recurrence..." 
              />
            </div>
          )}

          {result && (
            <div className="results-content animate-fade-in">
              {/* Executive Summary Card */}
              <div className="summary-card glass-card">
                <div className="summary-card-header">
                  <TrendingUp size={20} className="text-primary" />
                  <h3>Executive Analysis Summary</h3>
                </div>
                <p className="summary-text">{result.summary}</p>
                
                <div className="summary-stats-bar">
                  <div className="summary-stat-pill">
                    <span className="stat-label">Scanned Papers:</span>
                    <span className="stat-value">{result.total_documents}</span>
                  </div>
                  <div className="summary-stat-pill">
                    <span className="stat-label">Exact Questions Extracted:</span>
                    <span className="stat-value">{result.total_questions_found}</span>
                  </div>
                  <div className="summary-stat-pill">
                    <span className="stat-label">Recurring Themes:</span>
                    <span className="stat-value">{result.topics?.length || 0}</span>
                  </div>
                </div>
              </div>

              {/* View Switcher Tabs */}
              <div className="analysis-tabs-nav">
                <button
                  className={`tab-nav-btn ${activeTab === 'topics' ? 'active' : ''}`}
                  onClick={() => setActiveTab('topics')}
                >
                  <Sparkles size={16} />
                  <span>Recurring Exam Topics ({result.topics?.length || 0})</span>
                </button>
                <button
                  className={`tab-nav-btn ${activeTab === 'documents' ? 'active' : ''}`}
                  onClick={() => setActiveTab('documents')}
                >
                  <BookOpen size={16} />
                  <span>Exact Questions by Document ({result.exact_questions_by_doc?.length || 0})</span>
                </button>
              </div>

              {/* TAB 1: Recurring Topics */}
              {activeTab === 'topics' && (
                <div className="topics-list-container animate-fade-in">
                  {result.topics?.length === 0 && (
                    <div className="glass-card empty-topics">
                      <p>No repeated topics detected across the selected documents.</p>
                    </div>
                  )}

                  {result.topics?.map((topic, i) => (
                    <div key={i} className="topic-card glass-card card-hover">
                      <div className="topic-card-header">
                        <div className="topic-badge-rank">
                          Topic #{i + 1}
                        </div>
                        <div className="topic-header-badges">
                          <span className="badge badge-warning">
                            Frequency: {topic.frequency} paper{topic.frequency > 1 ? 's' : ''}
                          </span>
                          {topic.total_occurrences > 0 && (
                            <span className="badge badge-primary">
                              {topic.total_occurrences} question{topic.total_occurrences > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      <h4 className="topic-title">{topic.topic}</h4>

                      {/* Source Document Tags */}
                      {topic.document_names?.length > 0 && (
                        <div className="topic-doc-sources">
                          <span className="sources-label">Found in:</span>
                          <div className="sources-tags">
                            {topic.document_names.map((dName, dIdx) => (
                              <span key={dIdx} className="badge badge-secondary badge-sm doc-source-tag" title={dName}>
                                <FileText size={11} />
                                {dName}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Recurring Exact Questions */}
                      {topic.sample_questions?.length > 0 && (
                        <div className="topic-samples-box">
                          <div className="samples-heading">
                            <ListChecks size={15} />
                            <span>Exact Recurring Questions ({topic.sample_questions.length}):</span>
                          </div>
                          <div className="samples-list">
                            {topic.sample_questions.map((q, j) => (
                              <div key={j} className="sample-q-item">
                                <span className="sample-q-num">{j + 1}.</span>
                                <span className="sample-q-text">"{q}"</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Exam Advice Note */}
                      {topic.note && (
                        <div className="topic-note-box">
                          <AlertTriangle size={15} className="text-warning flex-shrink-0" />
                          <span>{topic.note}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 2: Exact Questions by Document */}
              {activeTab === 'documents' && (
                <div className="exact-docs-container animate-fade-in">
                  {result.exact_questions_by_doc?.map((docData, docIdx) => (
                    <div key={docIdx} className="exact-doc-card glass-card">
                      <div className="exact-doc-header">
                        <div className="exact-doc-title-box">
                          <FileText size={20} className="text-primary" />
                          <div>
                            <h4 className="exact-doc-name">{docData.document_name}</h4>
                            <span className="exact-doc-count">{docData.total_questions} exact questions extracted</span>
                          </div>
                        </div>
                        <button
                          className="btn btn-secondary btn-sm copy-doc-btn"
                          onClick={() => copyDocQuestions(docData.document_name, docData.questions)}
                        >
                          {copiedDoc === docData.document_name ? (
                            <>
                              <Check size={14} className="text-success" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy size={14} />
                              <span>Copy All</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="exact-questions-list">
                        {docData.questions?.length === 0 ? (
                          <div className="empty-doc-qs">No questions identified in this document.</div>
                        ) : (
                          docData.questions.map((qText, qIdx) => (
                            <div key={qIdx} className="exact-q-row">
                              <span className="exact-q-badge">Q{qIdx + 1}</span>
                              <span className="exact-q-content">{qText}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
