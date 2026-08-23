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
  Globe
} from 'lucide-react';
import './Chat.css';

const PROMPT_SUGGESTIONS = [
  "Summarize the main conclusions of my uploaded papers",
  "What methodology was used in the study?",
  "Extract key data points and statistics from the documents",
  "Compare findings across the uploaded research papers"
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
    <div className={`message-row ${isUser ? 'user-row' : 'ai-row'}`}>
      <div className={`message-avatar ${isUser ? 'user-avatar' : 'ai-avatar'}`}>
        {isUser ? <User size={16} /> : <Bot size={18} />}
      </div>

      <div className="message-wrapper">
        <div className="message-header">
          <span className="sender-name">{isUser ? 'You' : 'SmartDoc RAG AI'}</span>
          {!isUser && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="copy-btn" onClick={handleSpeak} title="Read aloud">
                <Volume2 size={14} className={speaking ? 'text-primary spin' : ''} />
              </button>
              <button className="copy-btn" onClick={handleCopy} title="Copy response">
                {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
              </button>
            </div>
          )}
        </div>

        <div className="message-bubble glass-card">
          <p className="message-text" style={{ whiteSpace: 'pre-wrap' }}>{msg.message}</p>
        </div>

        {msg.sources && msg.sources.length > 0 && (
          <div className="sources-container glass-card">
            <button 
              className="sources-toggle" 
              onClick={() => setShowSources(!showSources)}
            >
              <div className="sources-title">
                <BookOpen size={14} />
                <span>Verified Source Citations ({msg.sources.length})</span>
              </div>
              {showSources ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showSources && (
              <div className="sources-grid">
                {msg.sources.map((src, i) => (
                  <div key={i} className="source-card">
                    <div className="source-doc-name">
                      📄 {src.filename}
                    </div>
                    <div className="source-meta">
                      <span className="source-page">
                        {src.page_number ? `Page ${src.page_number}` : src.section || 'Section'}
                      </span>
                      {src.relevance_score && (
                        <span className="badge badge-primary">
                          {(src.relevance_score * 100).toFixed(0)}% match
                        </span>
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
    } catch { setError('Failed to load session history.'); }
    finally { setSessionLoading(false); }
  };

  const newChat = async () => {
    const res = await chatService.createSession('New Conversation');
    const session = res.data.data.session;
    setSessions(prev => [session, ...prev]);
    setActiveSession(session);
    setMessages([]);
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
            setError('Microphone access denied. Please allow microphone permissions in your browser settings.');
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
      const res = await chatService.createSession(query.slice(0, 50));
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

      if (currentSession.title === 'New Conversation') {
        setSessions(prev => prev.map(s =>
          s.id === currentSession.id ? { ...s, title: userMsg.message.slice(0, 50) } : s
        ));
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate answer. Ensure the AI model backend is running.');
    } finally {
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  return (
    <div className="chat-container animate-fade-in">
      {/* Chat History Sidebar */}
      <aside className="chat-history-pane glass-card">
        <div className="chat-pane-header">
          <div className="pane-title">
            <MessageSquare size={18} className="text-primary" />
            <span>Chat Sessions</span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={newChat}>
            <Plus size={16} />
            <span>New Chat</span>
          </button>
        </div>

        <div className="session-scroll-list">
          {sessions.length === 0 && (
            <div className="empty-sessions">
              <p>No previous conversations.</p>
            </div>
          )}
          {sessions.map(s => (
            <div 
              key={s.id} 
              className={`session-item ${activeSession?.id === s.id ? 'active' : ''}`}
              onClick={() => { setActiveSession(s); loadSession(s.id); navigate(`/chat/${s.id}`); }}
            >
              <MessageSquare size={16} className="session-icon" />
              <span className="session-title-text">{s.title}</span>
              <button 
                className="session-delete-btn" 
                onClick={(e) => deleteSession(s.id, e)}
                title="Delete session"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Main Chat Interface */}
      <main className="chat-main-pane glass-card">
        {/* Top Control Bar */}
        <div className="chat-filter-bar" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="filter-inputs" style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div className="mode-selector">
              <button 
                className={`mode-pill ${explanationMode === 'normal' ? 'active' : ''}`}
                onClick={() => setExplanationMode('normal')}
              >
                Explain Normally
              </button>
              <button 
                className={`mode-pill ${explanationMode === 'simple' ? 'active' : ''}`}
                onClick={() => setExplanationMode('simple')}
              >
                📖 Explain Simply
              </button>
              <button 
                className={`mode-pill ${explanationMode === 'example' ? 'active' : ''}`}
                onClick={() => setExplanationMode('example')}
              >
                💡 Give Example
              </button>
              <button 
                className={`mode-pill ${explanationMode === 'analogy' ? 'active' : ''}`}
                onClick={() => setExplanationMode('analogy')}
              >
                🎨 Give Analogy
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Globe size={15} className="text-primary" />
              <select 
                className="input select-sm" 
                value={language} 
                onChange={e => setLanguage(e.target.value)}
                style={{ width: 'auto' }}
              >
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
            </div>
          </div>

          <div className="filter-inputs" style={{ marginTop: 6, width: '100%' }}>
            <select 
              className="input select-sm" 
              value={filterDocId} 
              onChange={e => { setFilterDocId(e.target.value); setFilterCatId(''); }}
            >
              <option value="">All Uploaded Documents</option>
              {documents.map(d => <option key={d.id} value={d.id}>{d.original_filename}</option>)}
            </select>
            <select 
              className="input select-sm" 
              value={filterCatId} 
              onChange={e => { setFilterCatId(e.target.value); setFilterDocId(''); }}
            >
              <option value="">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {/* Message Thread */}
        <div className="messages-thread">
          {!activeSession && messages.length === 0 && (
            <div className="chat-welcome-hero">
              <div className="welcome-avatar">
                <Sparkles size={36} />
              </div>
              <h2>Ask Anything About Your Documents</h2>
              <p>SmartDoc AI uses RAG vector search to find exact quotes, page references, and structured insights from your knowledge base.</p>

              {/* Prompt Suggestion Chips */}
              <div className="prompt-suggestions">
                <div className="suggestions-label">Try asking:</div>
                <div className="chips-grid">
                  {PROMPT_SUGGESTIONS.map((prompt, idx) => (
                    <button 
                      key={idx} 
                      className="prompt-chip glass-card"
                      onClick={() => sendQuestion(prompt)}
                    >
                      <span>"{prompt}"</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {sessionLoading && <LoadingSpinner message="Retrieving conversation history..." />}
          
          {messages.map((msg, i) => (
            <Message key={msg.id || i} msg={msg} />
          ))}

          {loading && (
            <div className="message-row ai-row">
              <div className="message-avatar ai-avatar pulse-glow">
                <Bot size={18} />
              </div>
              <div className="message-wrapper">
                <div className="message-bubble glass-card typing-bubble">
                  <div className="typing-indicator">
                    <span /><span /><span />
                  </div>
                  <span className="typing-text">Analyzing documents and synthesizing answer...</span>
                </div>
              </div>
            </div>
          )}

          {error && <div className="alert alert-error" style={{ margin: '16px 0' }}>⚠️ {error}</div>}
          <div ref={bottomRef} />
        </div>

        {/* Input Box */}
        <form className="chat-input-form" onSubmit={(e) => { e.preventDefault(); sendQuestion(); }}>
          <button
            type="button"
            className={`btn btn-secondary ${isListening ? 'mic-btn-active' : ''}`}
            onClick={toggleVoiceInput}
            title={isListening ? "Listening... Click to stop" : "Ask by Voice"}
            style={{ padding: '0 12px' }}
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          <input
            className="input chat-input-field"
            placeholder={isListening ? "Listening to your voice..." : "Type your question or speak..."}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            disabled={loading}
          />

          <button 
            className="btn btn-primary send-btn" 
            type="submit" 
            disabled={loading || !question.trim()}
          >
            <Send size={16} />
            <span>Ask AI</span>
          </button>
        </form>
      </main>
    </div>
  );
}
