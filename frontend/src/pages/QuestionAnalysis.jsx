import { useState, useEffect } from 'react';
import { documentService } from '../services/documentService';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { 
  Search, 
  Sparkles, 
  FileText, 
  CheckSquare, 
  TrendingUp, 
  AlertTriangle, 
  ListChecks,
  ArrowRight
} from 'lucide-react';
import './QuestionAnalysis.css';

export default function QuestionAnalysis() {
  const [documents, setDocuments] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

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

  const analyze = async () => {
    if (selected.length === 0) return setError('Please select at least one document to analyze.');
    setError(''); setAnalyzing(true); setResult(null);
    try {
      const res = await api.post('/dashboard/analyze', { document_ids: selected });
      setResult(res.data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Analysis failed. Please try again.');
    } finally { 
      setAnalyzing(false); 
    }
  };  return (
    <div className="analysis-page animate-fade-in">
      <div className="page-header">
        <h1>Question Paper & Topic Analysis</h1>
        <p>Extract recurring exam topics, question patterns, and key concepts across your question papers.</p>
      </div>

      <div className="grid-2 analysis-grid">
        {/* Document Checklist Panel */}
        <div className="checklist-panel glass-card">
          <div className="panel-header">
            <div className="panel-title">
              <CheckSquare size={20} className="text-primary" />
              <h3>Select Target Documents</h3>
            </div>
            <span className="badge badge-primary">{selected.length} selected</span>
          </div>

          <p className="panel-subtitle">Select question papers or lecture notes to extract repeated exam questions.</p>

          {loading ? (
            <div className="doc-checklist">
              {[1, 2, 3].map(n => (
                <div key={n} className="doc-check-item glass-card skeleton-card" style={{ height: 48 }} />
              ))}
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
                    <div className="doc-check-name">{doc.original_filename}</div>
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
              <p>Select your question papers on the left and click "Analyze Selected Papers" to generate repeated topic summaries.</p>
            </div>
          )}

          {analyzing && <LoadingSpinner variant="bar" message="Extracting exam patterns & frequency clusters..." />}

          {result && (
            <div className="results-content animate-fade-in">
              {/* Summary Card */}
              <div className="summary-card glass-card">
                <div className="summary-card-header">
                  <TrendingUp size={20} className="text-primary" />
                  <h3>Executive Analysis Summary</h3>
                </div>
                <p className="summary-text">{result.summary}</p>
              </div>

              {result.topics?.length === 0 && (
                <div className="glass-card empty-topics">
                  <p>No repeated topics detected across the selected documents.</p>
                </div>
              )}

              {/* Topic Clusters */}
              {result.topics?.map((topic, i) => (
                <div key={i} className="topic-card glass-card card-hover">
                  <div className="topic-card-header">
                    <div className="topic-badge-rank">
                      Topic #{i + 1}
                    </div>
                    <span className="badge badge-warning">
                      Frequency: {topic.frequency} paper{topic.frequency > 1 ? 's' : ''}
                    </span>
                  </div>

                  <h4 className="topic-title">{topic.topic}</h4>

                  {topic.sample_questions?.length > 1 && (
                    <div className="topic-samples-box">
                      <div className="samples-heading">
                        <ListChecks size={14} />
                        <span>Recurring Question Forms:</span>
                      </div>
                      {topic.sample_questions.slice(1, 3).map((q, j) => (
                        <div key={j} className="sample-q-item">
                          <ArrowRight size={14} className="text-primary" />
                          <span>"{q}"</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {topic.note && (
                    <div className="topic-note-box">
                      <AlertTriangle size={14} className="text-warning" />
                      <span>{topic.note}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
