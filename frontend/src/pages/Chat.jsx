import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { chatService } from '../services/chatService';
import { documentService } from '../services/documentService';
import { categoryService } from '../services/categoryService';
import LoadingSpinner from '../components/LoadingSpinner';
import { 
  MessageSquare, 
  Plus, 
  Trash2, 
  Bot, 
  User, 
  Send, 
  Sparkles, 
  BookOpen, 
  Filter, 
  Copy, 
  Check,
  ChevronDown,
  ChevronUp,
  Mic,
  MicOff,
  Volume2,
  Globe,
  Layers,
  Zap,
  HelpCircle,
  FileText,
  SlidersHorizontal,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import './Chat.css';

const PROMPT_CATEGORIES = [
  {
    category: "Exam & Revision",
    prompts: [
      "Summarize the key high-yield topics from my uploaded study materials",
      "Generate 5 critical exam questions based on these documents"
    ]
  },
  {
    category: "Concept Deep-Dive",
    prompts: [
      "Explain the fundamental working principle step-by-step with an example",
      "Compare and contrast the main methods discussed in the documents"
    ]
  },
  {
    category: "Formulas & Definitions",
    prompts: [
      "Extract all key formulas, definitions, and equations mentioned",
      "Break down the methodology used in these documents"
    ]
  }
];

const LANGUAGES = [
  { code: 'English', name: 'English' },
  { code: 'Tamil', name: 'Tamil (தமிழ்)' },
  { code: 'Tamil + English', name: 'Tamil + English (Tanglish)' },
  { code: 'Hindi', name: 'Hindi (हिंदी)' },
  { code: 'Telugu', name: 'Telugu (తెలుగు)' }
];

function Message({ msg }) {
  const isUser = msg.role === 'user';
  const [copied, setCopied] = useState(false);
  const [showSources, setShowSources] = useState(true);
  const [speaking, setSpeaking] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSpeak = () => {
    if ('speechSynthesis' in window) {
      if (speaking) {
        window.speechSynthesis.cancel();
        setSpeaking(false);
      } else {
        const utterance = new SpeechSynthesisUtterance(msg.message);
        utterance.onend = () => setSpeaking(false);
        setSpeaking(true);
        window.speechSynthesis.speak(utterance);
      }
    }
  };

  return (
    <div className={`academic-message-row ${isUser ? 'user-msg-row' : 'ai-msg-row'}`}>
      <div className={`msg-avatar-badge ${isUser ? 'user-badge' : 'ai-badge'}`}>
        {isUser ? <User size={16} /> : <Bot size={18} />}
      </div>

      <div className="msg-content-wrapper">
        <div className="msg-meta-header">
          <div className="msg-sender-info">
            <span className="msg-sender-name">{isUser ? 'Student' : 'SmartDoc Neural RAG'}</span>
            {!isUser && <span className="badge badge-primary badge-sm">Verified Retrieval</span>}
          </div>
          
          {!isUser && (
            <div className="msg-actions">
              <button 
                className={`msg-action-btn ${speaking ? 'active-speech' : ''}`} 
                onClick={handleSpeak} 
                title={speaking ? "Stop speaking" : "Listen to answer"}
              >
                <Volume2 size={15} className={speaking ? 'pulse-audio' : ''} />
              </button>
              <button className="msg-action-btn" onClick={handleCopy} title="Copy response">
                {copied ? <Check size={15} className="text-success" /> : <Copy size={15} />}
              </button>
            </div>
          )}
        </div>

        <div className={`msg-bubble-card ${isUser ? 'user-bubble' : 'ai-bubble'}`}>
          <div className="msg-text-body">{msg.message}</div>
        </div>

        {msg.sources && msg.sources.length > 0 && (
          <div className="citation-tray holo-card">
            <button 
              className="citation-toggle-btn" 
              onClick={() => setShowSources(!showSources)}
            >
              <div className="citation-header-left">
                <BookOpen size={14} className="text-primary" />
                <span>Verified Source Citations ({msg.sources.length})</span>
              </div>
              {showSources ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showSources && (
              <div className="citation-grid">
                {msg.sources.map((src, i) => (
                  <div key={i} className="citation-item-card">
                    <div className="citation-top">
                      <span className="citation-doc-title">📄 {src.filename}</span>
                      {src.relevance_score && (
                        <span className="citation-match-pill">
                          {(src.relevance_score * 100).toFixed(0)}% match
                        </span>
                      )}
                    </div>
                    <div className="citation-loc">
                      {src.page_number ? `Page ${src.page_number}` : src.section || 'Document Excerpt'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Chat() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [explanationMode, setExplanationMode] = useState('normal');
  const [language, setLanguage] = useState('English');
  const [isListening, setIsListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filterDocId, setFilterDocId] = useState('');
  const [filterCatId, setFilterCatId] = useState('');
  const [error, setError] = useState('');
  const [showSessionsDrawer, setShowSessionsDrawer] = useState(false);
  const bottomRef = useRef();
  const recognitionRef = useRef(null);

  useEffect(() => {
    Promise.all([
      chatService.getSessions(),
      documentService.getAll(),
      categoryService.getAll(),
    ]).then(([sessRes, docRes, catRes]) => {
      setSessions(sessRes.data.data.sessions || []);
      const allDocs = docRes.data.data.documents || [];
      setDocuments(allDocs.filter(d => ['indexed', 'completed'].includes(d.upload_status?.toLowerCase())));
      setCategories(catRes.data.data.categories || []);
    });
  }, []);

  useEffect(() => {
    if (sessionId) loadSession(parseInt(sessionId));
  }, [sessionId]);

  const loadSession = async (id) => {
    setSessionLoading(true);
    try {
      const res = await chatService.getSession(id);
      const session = res.data.data.session;
      setActiveSession(session);
      setMessages(session.messages || []);
    } catch { 
      setError('Failed to load session history.'); 
    } finally { 
      setSessionLoading(false); 
    }
  };

  const newChat = async () => {
    const res = await chatService.createSession('New Consultation');
    const session = res.data.data.session;
    setSessions(prev => [session, ...prev]);
    setActiveSession(session);
    setMessages([]);
    setShowSessionsDrawer(false);
    navigate(`/chat/${session.id}`);
  };

  const deleteSession = async (id, e) => {
    e.stopPropagation();
    await chatService.deleteSession(id);
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSession?.id === id) { 
      setActiveSession(null); 
      setMessages([]); 
      navigate('/chat'); 
    }
  };

  const toggleVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please try Google Chrome or Microsoft Edge.");
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      setIsListening(false);
    } else {
      try {
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;

        recognition.continuous = true;
        recognition.interimResults = true;

        const langLower = language.toLowerCase();
        if (langLower.includes('tamil')) {
          recognition.lang = 'ta-IN';
        } else if (langLower.includes('hindi')) {
          recognition.lang = 'hi-IN';
        } else if (langLower.includes('telugu')) {
          recognition.lang = 'te-IN';
        } else {
          recognition.lang = 'en-US';
        }

        const initialPrompt = question ? question.trim() + ' ' : '';

        recognition.onstart = () => {
          setIsListening(true);
          setError('');
        };

        recognition.onresult = (e) => {
          let currentTranscript = '';
          for (let i = 0; i < e.results.length; i++) {
            currentTranscript += e.results[i][0].transcript;
          }
          setQuestion(initialPrompt + currentTranscript);
        };

        recognition.onerror = (e) => {
          if (e.error === 'not-allowed') {
            setError('Microphone access denied. Please allow microphone permissions in your browser.');
          } else if (e.error !== 'no-speech') {
            setError(`Voice input notice (${e.error}).`);
          }
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognition.start();
      } catch (err) {
        setError('Voice assistant initialization failed.');
        setIsListening(false);
      }
    }
  };

  const sendQuestion = async (promptText) => {
    const query = promptText || question;
    if (!query.trim() || loading) return;
    setError('');

    let currentSession = activeSession;
    if (!currentSession) {
      const res = await chatService.createSession(query.slice(0, 45));
      currentSession = res.data.data.session;
      setSessions(prev => [currentSession, ...prev]);
      setActiveSession(currentSession);
      navigate(`/chat/${currentSession.id}`);
    }

    const userMsg = { role: 'user', message: query, id: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setQuestion('');
    setLoading(true);

    try {
      const res = await chatService.ask({
        session_id: currentSession.id,
        question: userMsg.message,
        document_id: filterDocId ? parseInt(filterDocId) : null,
        category_id: filterCatId ? parseInt(filterCatId) : null,
        explanation_mode: explanationMode,
        language: language,
      });
      const { answer, sources } = res.data.data;
      const aiMsg = { role: 'assistant', message: answer, sources, id: Date.now() + 1 };
      setMessages(prev => [...prev, aiMsg]);

      if (currentSession.title === 'New Consultation' || currentSession.title === 'New Conversation') {
        setSessions(prev => prev.map(s =>
          s.id === currentSession.id ? { ...s, title: userMsg.message.slice(0, 45) } : s
        ));
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate answer. Please ensure backend is running.');
    } finally {
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuestion();
    }
  };

  return (
    <div className="academic-chat-layout animate-fade-in">
      {/* Sessions Backdrop on Mobile */}
      {showSessionsDrawer && (
        <div 
          className="chat-sessions-backdrop" 
          onClick={() => setShowSessionsDrawer(false)}
        />
      )}

      {/* Chat Sessions Sidebar Panel */}
      <aside className={`chat-history-sidebar glass-card ${showSessionsDrawer ? 'drawer-open' : ''}`}>
        <div className="chat-sidebar-header">
          <div className="chat-sidebar-title">
            <MessageSquare size={17} className="text-primary" />
            <span>Consultations</span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={newChat}>
            <Plus size={15} />
            <span>New</span>
          </button>
        </div>

        <div className="session-scroll-container">
          {sessions.length === 0 ? (
            <div className="empty-sessions-notice">
              <Sparkles size={24} className="text-muted" />
              <p>No previous conversations yet.</p>
            </div>
          ) : (
            sessions.map(s => (
              <div 
                key={s.id} 
                className={`session-nav-item ${activeSession?.id === s.id ? 'active-session' : ''}`}
                onClick={() => {
                  navigate(`/chat/${s.id}`);
                  setShowSessionsDrawer(false);
                }}
              >
                <MessageSquare size={15} className="session-item-icon" />
                <span className="session-item-title">{s.title || 'Untitled Chat'}</span>
                <button 
                  className="session-delete-btn" 
                  onClick={(e) => deleteSession(s.id, e)} 
                  title="Delete Session"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main Intelligence Workspace */}
      <section className="academic-chat-workspace glass-card">
        {/* Top Floating Control HUD */}
        <header className="chat-control-hud">
          <div className="hud-row-top">
            <button 
              className="toggle-sessions-btn btn btn-secondary btn-sm"
              onClick={() => setShowSessionsDrawer(!showSessionsDrawer)}
              title="Toggle Consultations Sidebar"
            >
              {showSessionsDrawer ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
              <span className="btn-label-mobile">History</span>
            </button>

            {/* Explanation Mode Chips */}
            <div className="academic-modes-row">
              <button 
                className={`mode-chip ${explanationMode === 'normal' ? 'active-mode' : ''}`}
                onClick={() => setExplanationMode('normal')}
              >
                Normal
              </button>
              <button 
                className={`mode-chip ${explanationMode === 'simple' ? 'active-mode' : ''}`}
                onClick={() => setExplanationMode('simple')}
              >
                📖 Beginner
              </button>
              <button 
                className={`mode-chip ${explanationMode === 'example' ? 'active-mode' : ''}`}
                onClick={() => setExplanationMode('example')}
              >
                💡 Examples
              </button>
              <button 
                className={`mode-chip ${explanationMode === 'analogy' ? 'active-mode' : ''}`}
                onClick={() => setExplanationMode('analogy')}
              >
                🎨 Analogy
              </button>
            </div>

            {/* Language Selector */}
            <div className="hud-language-selector">
              <Globe size={14} className="text-primary" />
              <select 
                className="select select-sm" 
                value={language} 
                onChange={e => setLanguage(e.target.value)}
              >
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
            </div>
          </div>

          {/* Context Filter Dropdowns */}
          <div className="hud-filters-bar">
            <div className="hud-filter-group">
              <FileText size={14} className="text-primary" />
              <select 
                className="select select-sm filter-select" 
                value={filterDocId} 
                onChange={e => { setFilterDocId(e.target.value); setFilterCatId(''); }}
              >
                <option value="">📚 All Uploaded Documents ({documents.length})</option>
                {documents.map(d => <option key={d.id} value={d.id}>{d.original_filename}</option>)}
              </select>
            </div>

            <div className="hud-filter-group">
              <Layers size={14} className="text-accent" />
              <select 
                className="select select-sm filter-select" 
                value={filterCatId} 
                onChange={e => { setFilterCatId(e.target.value); setFilterDocId(''); }}
              >
                <option value="">🏷️ All Categories ({categories.length})</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
        </header>

        {/* Message Thread Workspace */}
        <div className="chat-messages-container">
          {sessionLoading ? (
            <div className="chat-state-box">
              <LoadingSpinner message="Retrieving consultation memory..." />
            </div>
          ) : messages.length === 0 ? (
            <div className="chat-welcome-launchpad">
              <div className="welcome-avatar-holo">
                <Sparkles size={36} className="text-primary" />
              </div>
              <h2 className="welcome-title">Academic Intelligence Console</h2>
              <p className="welcome-desc">
                SmartDoc AI performs high-speed neural vector retrieval across your uploaded notes, textbooks, and question papers.
              </p>

              {/* Prompt Suggestion Cards */}
              <div className="prompt-launchpad-grid">
                {PROMPT_CATEGORIES.map((cat, idx) => (
                  <div key={idx} className="launchpad-category-card holo-card">
                    <div className="category-tag-title">{cat.category}</div>
                    <div className="category-prompts-list">
                      {cat.prompts.map((p, pIdx) => (
                        <button 
                          key={pIdx} 
                          className="prompt-pill-btn"
                          onClick={() => sendQuestion(p)}
                        >
                          <span>{p}</span>
                          <ChevronRight size={14} className="prompt-arrow" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages-stream">
              {messages.map((msg, idx) => (
                <Message key={msg.id || idx} msg={msg} />
              ))}
              
              {loading && (
                <div className="academic-message-row ai-msg-row">
                  <div className="msg-avatar-badge ai-badge pulse-glow">
                    <Bot size={18} />
                  </div>
                  <div className="msg-content-wrapper">
                    <div className="msg-bubble-card ai-bubble loading-bubble">
                      <div className="thinking-dots">
                        <span />
                        <span />
                        <span />
                      </div>
                      <span className="thinking-text">Searching indexed vector chunks & synthesizing explanation...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Error Notification Pill */}
        {error && (
          <div className="chat-error-toast">
            <span>{error}</span>
          </div>
        )}

        {/* Floating Intelligent Input Console */}
        <footer className="chat-input-console">
          <div className={`chat-input-bar ${isListening ? 'listening-active' : ''}`}>
            <button 
              className={`mic-btn ${isListening ? 'mic-on' : ''}`} 
              onClick={toggleVoiceInput}
              title={isListening ? "Stop listening" : "Speak question in English/Tamil/Hindi"}
            >
              {isListening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>

            <textarea 
              className="chat-textarea"
              placeholder={isListening ? "🎙️ Listening... speak clearly now" : "Ask any question from your uploaded materials (Press Enter to ask)..."}
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
            />

            <button 
              className="send-btn btn btn-primary"
              onClick={() => sendQuestion()}
              disabled={loading || !question.trim()}
              title="Send question"
            >
              <Send size={16} />
              <span>Ask AI</span>
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
