import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { chatService } from '../services/chatService';
import { documentService } from '../services/documentService';
import { categoryService } from '../services/categoryService';
import UserAvatar from '../components/UserAvatar';
import { 
  MessageSquare, 
  Plus, 
  Trash2, 
  Bot, 
  User, 
  Send, 
  Sparkles, 
  Copy, 
  Check,
  Mic, 
  MicOff, 
  Volume2, 
  Globe, 
  X 
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
  { code: 'Telugu', name: 'Telugu (తెలుగు)' }
];

// In-memory cache for loaded sessions across component remounts and tab switching
const sessionMessagesCache = new Map();

function AiRetrievalLoadingCard() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 1200);
    const t2 = setTimeout(() => setStage(2), 2600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const steps = [
    { label: 'Querying Vector Knowledge Base...', detail: 'Scanning similarity embeddings in knowledge base' },
    { label: 'Analyzing & Reranking Document Chunks...', detail: 'Extracting verified contextual evidence' },
    { label: 'Synthesizing Response with SmartDoc AI...', detail: 'Formulating structured grounded answer' }
  ];

  return (
    <div className="message-row ai-row animate-fade-in">
      <div className="message-avatar ai-avatar ai-avatar-generating">
        <img src="/logo-transparent.png" alt="SmartDoc AI" className="generating-logo-icon" />
        <div className="generating-halo-ring" />
      </div>
      <div className="message-wrapper">
        <div className="message-header">
          <span className="sender-name">SmartDoc RAG AI</span>
          <span className="ai-status-pill">
            <Sparkles size={11} className="ai-spin-icon" />
            <span>RAG Active</span>
          </span>
        </div>
        <div className="message-bubble ai-generating-card glass-card">
          {/* Step Progress Tracker */}
          <div className="rag-pipeline-tracker">
            <div className={`pipeline-step ${stage >= 0 ? 'active' : ''} ${stage > 0 ? 'completed' : ''}`}>
              <span className="step-dot" />
              <span className="step-label">Vector Search</span>
            </div>
            <div className={`pipeline-line ${stage >= 1 ? 'active' : ''}`} />
            <div className={`pipeline-step ${stage >= 1 ? 'active' : ''} ${stage > 1 ? 'completed' : ''}`}>
              <span className="step-dot" />
              <span className="step-label">Context Chunks</span>
            </div>
            <div className={`pipeline-line ${stage >= 2 ? 'active' : ''}`} />
            <div className={`pipeline-step ${stage >= 2 ? 'active' : ''}`}>
              <span className="step-dot" />
              <span className="step-label">AI Reasoning</span>
            </div>
          </div>

          <div className="generating-card-top">
            <div className="neural-equalizer">
              <span className="neural-bar bar-1" />
              <span className="neural-bar bar-2" />
              <span className="neural-bar bar-3" />
              <span className="neural-bar bar-4" />
              <span className="neural-bar bar-5" />
              <span className="neural-bar bar-6" />
              <span className="neural-bar bar-7" />
            </div>
            <div className="generating-text-group">
              <span className="generating-prompt-text">
                {steps[stage].label}
              </span>
              <span className="generating-sub-detail">
                {steps[stage].detail}
              </span>
            </div>
          </div>
          
          <div className="generating-shimmer-track">
            <div className="shimmer-bar bar-full" />
            <div className="shimmer-bar bar-three-quarters" />
            <div className="shimmer-bar bar-half" />
          </div>
        </div>
      </div>
    </div>
  );
}

const Message = memo(function Message({ msg, user }) {
  const isUser = msg.role === 'user';
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  // Strip ** formatting from messages
  const cleanMessage = useMemo(() => {
    return (msg.message || '').replace(/\*\*/g, '');
  }, [msg.message]);

  const handleCopy = () => {
    navigator.clipboard.writeText(cleanMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSpeak = () => {
    if ('speechSynthesis' in window) {
      if (speaking) {
        window.speechSynthesis.cancel();
        setSpeaking(false);
      } else {
        const utterance = new SpeechSynthesisUtterance(cleanMessage);
        utterance.onend = () => setSpeaking(false);
        setSpeaking(true);
        window.speechSynthesis.speak(utterance);
      }
    }
  };

  // If this is an assistant placeholder waiting for the first streaming chunk
  if (!isUser && msg.streaming && !msg.message) {
    return <AiRetrievalLoadingCard />;
  }

  return (
    <div className={`message-row ${isUser ? 'user-row' : 'ai-row'} message-appear`}>
      <div className={`message-avatar ${isUser ? 'user-avatar' : 'ai-avatar'}`} title={isUser ? (user?.name || 'You') : 'SmartDoc RAG AI'}>
        {isUser ? (
          <UserAvatar 
            user={user} 
            size={34} 
            border="1.5px solid var(--border-active)"
            boxShadow="0 2px 10px var(--primary-glow)"
          />
        ) : (
          <img src="/logo-transparent.png" alt="SmartDoc AI" className="ai-avatar-logo" />
        )}
      </div>

      <div className="message-wrapper">
        <div className="message-header">
          <span className="sender-name">{isUser ? 'You' : 'SmartDoc RAG AI'}</span>
          {!isUser && msg.streaming && (
            <span className="ai-streaming-pill">
              <span className="streaming-pulse-dot" />
              <span>Streaming answer...</span>
            </span>
          )}
          {!isUser && !msg.streaming && (
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
          <p className="message-text" style={{ whiteSpace: 'pre-wrap' }}>
            {cleanMessage}
            {!isUser && msg.streaming && <span className="streaming-cursor" />}
          </p>
        </div>
      </div>
    </div>
  );
});

export default function Chat() {
  const { user } = useAuth();
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState(() => sessionStorage.getItem('chat_draft_question') || '');
  const [explanationMode, setExplanationMode] = useState(() => sessionStorage.getItem('chat_explanation_mode') || 'normal');
  const [language, setLanguage] = useState(() => sessionStorage.getItem('chat_language') || 'English');
  const [isListening, setIsListening] = useState(false);
  const [isVoiceStarting, setIsVoiceStarting] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [showSessionsDrawer, setShowSessionsDrawer] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filterDocId, setFilterDocId] = useState('');
  const [filterCatId, setFilterCatId] = useState('');
  const [error, setError] = useState('');
  const [interimSpeech, setInterimSpeech] = useState('');
  const bottomRef = useRef();
  const messagesThreadRef = useRef(null);
  const recognitionRef = useRef(null);
  const isListeningRef = useRef(false);
  const sessionFinalTranscriptRef = useRef('');
  const currentInstanceFinalRef = useRef('');
  const baseQuestionRef = useRef('');
  const restartTimeoutRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const speechRecognizedRef = useRef(false);

  // Clean up recognition instance, recorder, and audio on component unmount
  useEffect(() => {
    return () => {
      isListeningRef.current = false;
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch (e) {}
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => {
          try { t.stop(); } catch (e) {}
        });
      }
      if (audioContextRef.current) {
        try {
          if (audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close();
          }
        } catch (e) {}
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }
    };
  }, []);

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

  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;
  const skipNextLoadSessionRef = useRef(null);

  useEffect(() => {
    try {
      if (question) {
        sessionStorage.setItem('chat_draft_question', question);
      } else {
        sessionStorage.removeItem('chat_draft_question');
      }
    } catch {}
  }, [question]);

  useEffect(() => {
    try {
      sessionStorage.setItem('chat_explanation_mode', explanationMode);
    } catch {}
  }, [explanationMode]);

  useEffect(() => {
    try {
      sessionStorage.setItem('chat_language', language);
    } catch {}
  }, [language]);

  useEffect(() => {
    if (!sessionId) {
      const activeId = sessionStorage.getItem('active_chat_session_id');
      if (activeId) {
        navigate(`/chat/${activeId}`, { replace: true });
        return;
      }
      setActiveSession(null);
      activeSessionRef.current = null;
      setMessages([]);
      return;
    }
    const id = parseInt(sessionId);
    sessionStorage.setItem('active_chat_session_id', id);
    if (skipNextLoadSessionRef.current === id) {
      // Session was just created by sendQuestion or newChat; keep live messages!
      skipNextLoadSessionRef.current = null;
      return;
    }
    if (activeSessionRef.current?.id === id && (loadingRef.current || messages.length > 0)) {
      return;
    }
    loadSession(id);
  }, [sessionId]);

  const loadSession = async (id) => {
    if (loadingRef.current && activeSessionRef.current?.id === id) {
      return;
    }
    sessionStorage.setItem('active_chat_session_id', id);

    // Instant 0ms cache retrieval if already in memory
    const cached = sessionMessagesCache.get(id);
    if (cached) {
      setActiveSession(cached.session);
      activeSessionRef.current = cached.session;
      setMessages(cached.messages);
      setSessionLoading(false);
      // Silently refresh in the background without blocking UI or showing loader
      chatService.getSession(id).then(res => {
        const session = res.data.data.session;
        sessionMessagesCache.set(id, { session, messages: session.messages || [] });
      }).catch(() => {});
      return;
    }

    setSessionLoading(true);
    try {
      const res = await chatService.getSession(id);
      const session = res.data.data.session;
      const msgs = session.messages || [];
      sessionMessagesCache.set(id, { session, messages: msgs });
      setActiveSession(session);
      activeSessionRef.current = session;
      setMessages(msgs);
    } catch { 
      setError('Failed to load session history.'); 
    } finally { 
      setSessionLoading(false); 
    }
  };

  const newChat = async () => {
    const res = await chatService.createSession('New Conversation');
    const session = res.data.data.session;
    skipNextLoadSessionRef.current = session.id;
    sessionStorage.setItem('active_chat_session_id', session.id);
    sessionMessagesCache.set(session.id, { session, messages: [] });
    setSessions(prev => [session, ...prev]);
    setActiveSession(session);
    activeSessionRef.current = session;
    setMessages([]);
    navigate(`/chat/${session.id}`);
  };

  const deleteSession = async (id, e) => {
    e.stopPropagation();
    await chatService.deleteSession(id);
    sessionMessagesCache.delete(id);
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSession?.id === id || String(sessionStorage.getItem('active_chat_session_id')) === String(id)) { 
      sessionStorage.removeItem('active_chat_session_id');
      setActiveSession(null); 
      setMessages([]); 
      navigate('/chat'); 
    }
  };

  const getSpeechLanguage = (lang) => {
    const l = (lang || '').toLowerCase();
    if (l === 'tamil' || (l.includes('tamil') && !l.includes('english'))) return 'ta-IN';
    if (l.includes('tanglish') || (l.includes('tamil') && l.includes('english'))) {
      return 'en-IN';
    }
    if (l.includes('hindi')) return 'hi-IN';
    if (l.includes('telugu')) return 'te-IN';
    if (l.includes('malayalam')) return 'ml-IN';
    if (l.includes('kannada')) return 'kn-IN';
    if (l.includes('spanish')) return 'es-ES';
    if (l.includes('french')) return 'fr-FR';
    if (l.includes('german')) return 'de-DE';
    if (typeof navigator !== 'undefined' && navigator.language && navigator.language.startsWith('en')) {
      return navigator.language;
    }
    return 'en-IN';
  };

  const stopAudioAnalyser = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        try { track.stop(); } catch (e) {}
      });
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }
      } catch (e) {}
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  };

  const startAudioAnalyser = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.4;
        analyserRef.current = analyser;

        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const checkAudio = () => {
          if (!isListeningRef.current) return;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          const level = Math.min(100, Math.round((avg / 128) * 100));
          setAudioLevel(level);
          animationFrameRef.current = requestAnimationFrame(checkAudio);
        };
        animationFrameRef.current = requestAnimationFrame(checkAudio);
      }
      return true;
    } catch (err) {
      console.error('Audio stream / permission error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Microphone access was blocked. Please click the lock or site settings icon in your browser address bar and set Microphone to "Allow".');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError('No microphone found. Please connect a microphone to your device and check Windows sound settings.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setError('Microphone is busy or locked by another application. Please close other voice/video apps and try again.');
      } else {
        setError('Could not access microphone: ' + (err.message || 'Check browser permissions.'));
      }
      return false;
    }
  };

  const stopVoiceInput = async (autoSubmit = false) => {
    isListeningRef.current = false;
    setIsListening(false);
    setIsVoiceStarting(false);
    setInterimSpeech('');

    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    // Stop speech recognition instance
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch (err) {}
      recognitionRef.current = null;
    }

    const liveTranscript = (sessionFinalTranscriptRef.current + currentInstanceFinalRef.current).trim();

    // Check if we have audio recorded via MediaRecorder
    const recorder = mediaRecorderRef.current;
    let recordedBlob = null;
    if (recorder && recorder.state !== 'inactive') {
      recordedBlob = await new Promise((resolve) => {
        recorder.onstop = () => {
          const chunks = audioChunksRef.current;
          if (chunks && chunks.length > 0) {
            const mimeType = chunks[0]?.type || 'audio/webm';
            resolve(new Blob(chunks, { type: mimeType }));
          } else {
            resolve(null);
          }
        };
        try {
          recorder.stop();
        } catch (e) {
          resolve(null);
        }
      });
    }

    stopAudioAnalyser();

    // If Web Speech API captured spoken text, use it immediately
    if (liveTranscript) {
      const finalVal = [baseQuestionRef.current.trim(), liveTranscript].filter(Boolean).join(' ');
      setQuestion(finalVal);
      sessionFinalTranscriptRef.current = '';
      currentInstanceFinalRef.current = '';
      if (autoSubmit) {
        sendQuestion(finalVal);
      }
      return;
    }

    // If Web Speech API did NOT convert text (the browser issue reported by user),
    // transcribe the recorded audio using Gemini AI!
    if (recordedBlob && recordedBlob.size > 1500) {
      setIsTranscribing(true);
      try {
        const reader = new FileReader();
        const base64Data = await new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(recordedBlob);
        });

        if (base64Data) {
          const res = await chatService.transcribeAudio(base64Data, recordedBlob.type, language);
          const aiText = res.data?.data?.transcript || '';
          if (aiText.trim()) {
            const finalVal = [baseQuestionRef.current.trim(), aiText.trim()].filter(Boolean).join(' ');
            setQuestion(finalVal);
            sessionFinalTranscriptRef.current = '';
            currentInstanceFinalRef.current = '';
            if (autoSubmit) {
              sendQuestion(finalVal);
            }
            setIsTranscribing(false);
            return;
          }
        }
      } catch (err) {
        console.warn('Gemini audio transcription warning:', err);
        setError('Could not transcribe audio. Please try speaking clearly or type your question.');
      } finally {
        setIsTranscribing(false);
      }
    }

    sessionFinalTranscriptRef.current = '';
    currentInstanceFinalRef.current = '';
  };

  const cancelVoiceInput = () => {
    isListeningRef.current = false;
    setIsListening(false);
    setIsVoiceStarting(false);
    setIsTranscribing(false);
    setInterimSpeech('');
    audioChunksRef.current = [];

    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (e) {}
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }

    stopAudioAnalyser();
    setQuestion(baseQuestionRef.current.trim());
    sessionFinalTranscriptRef.current = '';
    currentInstanceFinalRef.current = '';
  };

  const initAndStartRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      const targetLang = getSpeechLanguage(language);
      recognition.lang = targetLang;

      recognition.onstart = () => {
        setIsVoiceStarting(false);
        setIsListening(true);
        setError('');
      };

      recognition.onresult = (e) => {
        let instanceFinal = '';
        let instanceInterim = '';
        for (let i = 0; i < e.results.length; i++) {
          const item = e.results[i];
          const transcript = item[0]?.transcript || '';
          if (item.isFinal) {
            instanceFinal += transcript + ' ';
          } else {
            instanceInterim += transcript;
          }
        }
        currentInstanceFinalRef.current = instanceFinal;
        setInterimSpeech(instanceInterim);

        const totalTranscript = (sessionFinalTranscriptRef.current + instanceFinal).trim();
        const liveText = instanceInterim.trim();
        const combined = [baseQuestionRef.current.trim(), totalTranscript, liveText].filter(Boolean).join(' ');
        setQuestion(combined);
      };

      recognition.onerror = (e) => {
        console.warn('Speech recognition warning:', e.error);
        if (e.error === 'not-allowed') {
          setError('Microphone access blocked. Click the lock/tune icon in your browser address bar to allow microphone access.');
          stopVoiceInput(false);
        }
      };

      recognition.onend = () => {
        sessionFinalTranscriptRef.current = (sessionFinalTranscriptRef.current + currentInstanceFinalRef.current);
        currentInstanceFinalRef.current = '';
        setInterimSpeech('');

        if (isListeningRef.current) {
          if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
          restartTimeoutRef.current = setTimeout(() => {
            if (isListeningRef.current) {
              initAndStartRecognition();
            }
          }, 150);
        }
      };

      recognition.start();
    } catch (err) {
      console.warn('SpeechRecognition start failed (will use Gemini audio transcription):', err);
    }
  };

  const startVoiceInput = async () => {
    setError('');
    setIsVoiceStarting(true);
    audioChunksRef.current = [];

    // 1. Get mic access and start audio visualizer
    const micReady = await startAudioAnalyser();
    if (!micReady) {
      setIsVoiceStarting(false);
      return;
    }

    baseQuestionRef.current = question ? question.trim() + ' ' : '';
    sessionFinalTranscriptRef.current = '';
    currentInstanceFinalRef.current = '';
    setInterimSpeech('');
    isListeningRef.current = true;
    setIsListening(true);
    setIsVoiceStarting(false);

    // 2. Start high-fidelity MediaRecorder
    try {
      if (window.MediaRecorder && mediaStreamRef.current) {
        let options = { mimeType: 'audio/webm;codecs=opus' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: 'audio/webm' };
          if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'audio/mp4' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
              options = undefined;
            }
          }
        }
        const recorder = options ? new MediaRecorder(mediaStreamRef.current, options) : new MediaRecorder(mediaStreamRef.current);
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };
        recorder.start(250);
      }
    } catch (e) {
      console.warn('MediaRecorder init warning:', e);
    }

    // 3. Attempt Web Speech API for live transcription
    initAndStartRecognition();
  };

  const toggleVoiceInput = () => {
    if (isListening || isVoiceStarting || isTranscribing) {
      stopVoiceInput(false);
    } else {
      startVoiceInput();
    }
  };

  const scrollToBottom = useCallback(() => {
    if (messagesThreadRef.current) {
      messagesThreadRef.current.scrollTop = messagesThreadRef.current.scrollHeight;
    }
  }, []);

  const sendQuestion = useCallback(async (promptText) => {
    stopVoiceInput();
    const query = promptText || question;
    if (!query.trim() || loading) return;
    setError('');

    let currentSession = activeSession;
    if (!currentSession) {
      const res = await chatService.createSession(query.slice(0, 50));
      currentSession = res.data.data.session;
      skipNextLoadSessionRef.current = currentSession.id;
      sessionStorage.setItem('active_chat_session_id', currentSession.id);
      setSessions(prev => [currentSession, ...prev]);
      setActiveSession(currentSession);
      activeSessionRef.current = currentSession;
      navigate(`/chat/${currentSession.id}`, { replace: true });
    } else {
      sessionStorage.setItem('active_chat_session_id', currentSession.id);
    }

    // Add user message immediately
    const userMsg = { role: 'user', message: query, id: Date.now() };
    // Add empty AI placeholder so the typing indicator shows inline
    const aiPlaceholderId = Date.now() + 1;
    const aiPlaceholder = { role: 'assistant', message: '', sources: [], id: aiPlaceholderId, streaming: true };
    setMessages(prev => [...prev, userMsg, aiPlaceholder]);
    setQuestion('');
    setLoading(true);
    loadingRef.current = true;
    requestAnimationFrame(() => scrollToBottom());

    try {
      await chatService.askStream(
        {
          session_id: currentSession?.id || activeSession?.id || parseInt(sessionId),
          question: query,
          document_id: filterDocId ? parseInt(filterDocId) : null,
          category_id: filterCatId ? parseInt(filterCatId) : null,
          explanation_mode: explanationMode,
          language: language,
        },
        {
          onChunk: (text) => {
            // Append each token to the streaming placeholder
            setMessages(prev => prev.map(m =>
              m.id === aiPlaceholderId
                ? { ...m, message: m.message + text }
                : m
            ));
            requestAnimationFrame(() => scrollToBottom());
          },
          onDone: ({ sources, message_id, session_id } = {}) => {
            // Finalise: remove streaming flag, attach sources
            try {
              setMessages(prev => {
                const updated = prev.map(m =>
                  m.id === aiPlaceholderId
                    ? { ...m, sources: sources || [], streaming: false }
                    : m
                );
                const targetId = currentSession?.id || activeSession?.id || parseInt(sessionId);
                if (targetId) {
                  sessionMessagesCache.set(targetId, { session: currentSession || activeSession, messages: updated });
                }
                return updated;
              });
              if (currentSession?.title === 'New Conversation' || currentSession?.title === 'New Chat') {
                setSessions(prev => prev.map(s =>
                  s.id === currentSession.id ? { ...s, title: query.slice(0, 50) } : s
                ));
              }
            } finally {
              setLoading(false);
              loadingRef.current = false;
              requestAnimationFrame(() => scrollToBottom());
            }
          },
          onError: (msg) => {
            setError(msg || 'Failed to generate answer. Please try again.');
            // Remove the empty placeholder on error
            setMessages(prev => prev.filter(m => m.id !== aiPlaceholderId));
            setLoading(false);
            loadingRef.current = false;
          },
        }
      );
    } catch (err) {
      console.warn('askStream execution error:', err);
    } finally {
      // Guarantee UI state unfreezes in all circumstances
      setLoading(false);
      loadingRef.current = false;
      setMessages(prev => prev.map(m =>
        m.id === aiPlaceholderId ? { ...m, streaming: false } : m
      ));
      requestAnimationFrame(() => scrollToBottom());
    }
  }, [activeSession, question, loading, filterDocId, filterCatId, explanationMode, language, scrollToBottom, sessionId]);


  return (
    <div className="chat-container animate-fade-in">
      {/* Slide-out Sessions Drawer */}
      {showSessionsDrawer && (
        <div className="chat-drawer-backdrop animate-fade-in" onClick={() => setShowSessionsDrawer(false)}>
          <aside 
            className="chat-history-drawer glass-card animate-slide-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="chat-pane-header">
              <div className="pane-title">
                <MessageSquare size={18} className="text-primary" />
                <span>Chat Sessions</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button 
                  type="button" 
                  className="btn btn-primary btn-xs" 
                  onClick={() => { newChat(); setShowSessionsDrawer(false); }}
                  title="New conversation"
                >
                  <Plus size={14} />
                  <span>New</span>
                </button>
                <button 
                  type="button" 
                  className="btn-icon btn-ghost btn-sm" 
                  onClick={() => setShowSessionsDrawer(false)}
                  title="Close sessions panel"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="session-scroll-list">
              {sessions.length === 0 ? (
                <div className="empty-sessions">
                  <p>No previous conversations.</p>
                </div>
              ) : (
                sessions.map(s => (
                  <div 
                    key={s.id} 
                    className={`session-item ${activeSession?.id === s.id ? 'active' : ''}`}
                    onClick={() => { 
                      setActiveSession(s); 
                      loadSession(s.id); 
                      navigate(`/chat/${s.id}`);
                      setShowSessionsDrawer(false);
                    }}
                  >
                    <MessageSquare size={16} className="session-icon" />
                    <span className="session-title-text">{s.title}</span>
                    <button 
                      className="session-delete-btn" 
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(s.id, e);
                      }}
                      title="Delete session"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Main Full-Width Chat Interface */}
      <main className="chat-main-pane glass-card">
        {/* Top Control Bar */}
        <div className="chat-filter-bar">
          <div className="chat-top-nav-row">
            {/* Clickable Button to Open Chat Sessions */}
            <div className="chat-session-btn-group">
              <button 
                type="button"
                className={`btn btn-secondary btn-sm chat-sessions-trigger-btn ${showSessionsDrawer ? 'active' : ''}`}
                onClick={() => setShowSessionsDrawer(true)}
                title="View previous chat sessions"
              >
                <MessageSquare size={16} className="text-primary" />
                <span>Chat Sessions</span>
              </button>

              <button 
                type="button" 
                className="btn btn-primary btn-sm chat-new-btn-quick"
                onClick={newChat}
                title="Start a new chat conversation"
              >
                <Plus size={15} />
                <span>New Chat</span>
              </button>
            </div>

            {/* Explanation Mode Pills */}
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

            {/* Language Selector */}
            <div className="chat-lang-group">
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

          {/* Document & Category Filters */}
          <div className="filter-inputs" style={{ marginTop: 8, width: '100%', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <select 
              className="input select-sm" 
              value={filterDocId} 
              onChange={e => { setFilterDocId(e.target.value); setFilterCatId(''); }}
              style={{ flex: 1, minWidth: 160 }}
            >
              <option value="">All Uploaded Documents</option>
              {documents.map(d => <option key={d.id} value={d.id}>{d.original_filename}</option>)}
            </select>

            <select 
              className="input select-sm" 
              value={filterCatId} 
              onChange={e => { setFilterCatId(e.target.value); setFilterDocId(''); }}
              style={{ flex: 1, minWidth: 160 }}
            >
              <option value="">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {/* Message Thread */}
        <div className="messages-thread" ref={messagesThreadRef}>
          {/* SmartDoc AI Central Background Watermark */}
          <div className="chat-center-watermark" aria-hidden="true">
            <img src="/logo-transparent.png" alt="" className="chat-center-watermark-logo" />
            <div className="chat-center-watermark-brand">
              SmartDoc <span className="logo-badge">AI</span>
            </div>
            <div className="chat-center-watermark-sub">Document Intelligence</div>
          </div>

          {!activeSession && messages.length === 0 && (
            <div className="chat-welcome-hero">
              <div className="welcome-avatar-container">
                <div className="welcome-avatar-glow-ring" />
                <div className="welcome-avatar">
                  <img src="/logo-transparent.png" alt="SmartDoc AI" className="welcome-project-logo" />
                </div>
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

          {sessionLoading && (
            <div className="chat-skeleton-container">
              <div className="skeleton-status-pill animate-fade-in">
                <span className="skeleton-pulse-dot" />
                <span>Restoring conversation history...</span>
              </div>
              <div className="skeleton-row skeleton-user-row animate-fade-in">
                <div className="skeleton-avatar skeleton-user-avatar pulse-glow" />
                <div className="skeleton-bubble">
                  <div className="skeleton-line line-medium" />
                  <div className="skeleton-line line-short" />
                </div>
              </div>
              <div className="skeleton-row skeleton-ai-row animate-fade-in">
                <div className="skeleton-avatar skeleton-ai-avatar pulse-glow" />
                <div className="skeleton-bubble">
                  <div className="skeleton-line line-long" />
                  <div className="skeleton-line line-full" />
                  <div className="skeleton-line line-medium" />
                </div>
              </div>
            </div>
          )}
          
          {messages.map((msg, i) => (
            <Message key={msg.id || i} msg={msg} user={user} />
          ))}



          {error && <div className="alert alert-error" style={{ margin: '16px 0' }}>⚠️ {error}</div>}
          <div ref={bottomRef} />
        </div>

        {/* Live Voice Assistant Banner */}
        {/* Live Voice Assistant Banner */}
        {(isListening || isVoiceStarting || isTranscribing) && (
          <div className="voice-listening-bar glass-card animate-fade-in">
            <div className="voice-bar-left">
              <div className="voice-waveform" title={`Microphone Volume: ${audioLevel}%`}>
                <span className="wave-bar bar-1" style={{ height: `${Math.max(6, Math.min(26, 6 + (audioLevel * 0.2)))}px` }} />
                <span className="wave-bar bar-2" style={{ height: `${Math.max(10, Math.min(30, 10 + (audioLevel * 0.24)))}px` }} />
                <span className="wave-bar bar-3" style={{ height: `${Math.max(14, Math.min(34, 14 + (audioLevel * 0.28)))}px` }} />
                <span className="wave-bar bar-4" style={{ height: `${Math.max(10, Math.min(30, 10 + (audioLevel * 0.24)))}px` }} />
                <span className="wave-bar bar-5" style={{ height: `${Math.max(6, Math.min(26, 6 + (audioLevel * 0.2)))}px` }} />
              </div>
              <div className="voice-status-text">
                <span className={`voice-pulse-dot ${audioLevel > 15 ? 'active-sound' : ''}`} />
                <div className="voice-text-column">
                  <span className="voice-listening-label">
                    {isTranscribing ? (
                      <span className="transcribing-text">✨ Transcribing your voice with Gemini AI...</span>
                    ) : isVoiceStarting ? (
                      <span>Connecting microphone...</span>
                    ) : interimSpeech ? (
                      <span className="interim-text">"{interimSpeech}"</span>
                    ) : audioLevel > 15 ? (
                      <span className="sound-detected">Hearing voice... speak clearly</span>
                    ) : (
                      <span>Listening... speak in <strong>{language || 'English'}</strong></span>
                    )}
                  </span>
                  {!interimSpeech && !isVoiceStarting && !isTranscribing && (
                    <span className="voice-subhint">
                      {audioLevel > 15 ? 'Voice detected — click "Done" when finished' : 'Mic active — start speaking to transcribe'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="voice-bar-actions">
              <button 
                type="button"
                className="btn btn-secondary btn-sm voice-action-btn"
                onClick={() => stopVoiceInput(false)}
                disabled={isTranscribing}
                title="Finish speaking and enter text into chatbox"
              >
                <Check size={14} />
                <span>Done</span>
              </button>

              <button
                type="button"
                className="btn btn-primary btn-sm voice-action-btn"
                onClick={() => stopVoiceInput(true)}
                disabled={isTranscribing}
                title="Submit voice question to AI directly"
              >
                <Send size={14} />
                <span>Ask AI</span>
              </button>

              <button 
                type="button"
                className="btn-icon voice-cancel-btn"
                onClick={cancelVoiceInput}
                disabled={isTranscribing}
                title="Cancel voice input"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        )}

        {/* Input Box */}
        <form className="chat-input-form" onSubmit={(e) => { e.preventDefault(); sendQuestion(); }}>
          <button
            type="button"
            className={`btn btn-secondary ${isListening ? 'mic-btn-active' : ''} ${isVoiceStarting || isTranscribing ? 'mic-btn-starting' : ''}`}
            onClick={toggleVoiceInput}
            title={isTranscribing ? "Transcribing voice with AI..." : isListening ? "Listening... Click to stop" : isVoiceStarting ? "Starting microphone..." : "Ask by Voice"}
            style={{ padding: '0 12px' }}
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          <input
            className="input chat-input-field"
            placeholder={isTranscribing ? "Transcribing your voice with Gemini AI..." : isListening ? "Listening to your voice... (words appear here)" : "Type your question or speak..."}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            disabled={loading || isTranscribing}
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
