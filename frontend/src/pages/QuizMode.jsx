import { useState, useEffect } from 'react';
import { quizService } from '../services/quizService';
import LoadingSpinner from '../components/LoadingSpinner';
import { 
  HelpCircle, 
  Play, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Award, 
  Sparkles, 
  ArrowRight,
  RefreshCw,
  FileQuestion
} from 'lucide-react';

export default function QuizMode() {
  const [activeTab, setActiveTab] = useState('interactive'); // 'interactive' or 'generator'
  
  // Generator states
  const [topic, setTopic] = useState('');
  const [questionType, setQuestionType] = useState('MCQs');
  const [markType, setMarkType] = useState('5');
  const [count, setCount] = useState(5);
  const [generatedText, setGeneratedText] = useState('');

  // Interactive Quiz states
  const [subject, setSubject] = useState('');
  const [quizTopic, setQuizTopic] = useState('');
  const [questionCount, setQuestionCount] = useState(5);
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [timeLeft, setTimeLeft] = useState(60); // 60s per question
  const [timerActive, setTimerActive] = useState(false);

  const [quizSession, setQuizSession] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userAnswerText, setUserAnswerText] = useState('');
  const [selectedOption, setSelectedOption] = useState(null);
  const [evalResult, setEvalResult] = useState(null);
  const [evaluating, setEvaluating] = useState(false);
  const [scoreBoard, setScoreBoard] = useState({ total: 0, correct: 0 });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Countdown timer effect
  useEffect(() => {
    let timer = null;
    if (timerActive && timerEnabled && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            handleAutoSubmitOnTimeout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [timerActive, timerEnabled, timeLeft]);

  const handleAutoSubmitOnTimeout = () => {
    if (!evalResult && quizSession) {
      handleAnswerSubmit(selectedOption !== null ? quizSession.questions[currentIdx]?.options[selectedOption] : "Time Expired - No Answer Submitted");
    }
  };

  const handleGenerateQuestions = async () => {
    if (!topic.trim()) { setError('Please enter a topic or subject.'); return; }
    setError(''); setLoading(true);
    try {
      const res = await quizService.generateQuestions({
        topic, question_type: questionType, mark_type: markType, count
      });
      setGeneratedText(res.data.data.questions_text);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate questions.');
    } finally { setLoading(false); }
  };

  const handleStartQuiz = async () => {
    if (!subject.trim() || !quizTopic.trim()) {
      setError('Please enter both subject and topic.'); return;
    }
    setError(''); setLoading(true); setQuizSession(null); setEvalResult(null);
    setCurrentIdx(0); setScoreBoard({ total: 0, correct: 0 });
    try {
      const res = await quizService.startQuiz({
        subject, topic: quizTopic, count: questionCount
      });
      setQuizSession(res.data.data);
      setTimeLeft(60); setTimerActive(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start quiz session.');
    } finally { setLoading(false); }
  };

  const handleAnswerSubmit = async (overrideAns) => {
    if (!quizSession) return;
    const qObj = quizSession.questions[currentIdx];
    const finalAns = overrideAns || (selectedOption !== null ? qObj.options[selectedOption] : userAnswerText);

    if (!finalAns.trim()) { setError('Please select or type an answer.'); return; }
    setError(''); setEvaluating(true); setTimerActive(false);

    try {
      const res = await quizService.evaluateAnswer({
        attempt_id: quizSession.attempt_id,
        question: qObj.question,
        user_answer: finalAns,
        expected_answer: qObj.correct_answer || "",
        topic_tag: qObj.topic_tag || quizTopic
      });

      const evaluation = res.data.data;
      setEvalResult(evaluation);
      setScoreBoard(prev => ({
        total: prev.total + 1,
        correct: prev.correct + (evaluation.is_correct ? 1 : 0)
      }));
    } catch (err) {
      setError(err.response?.data?.error || 'Evaluation failed.');
    } finally { setEvaluating(false); }
  };

  const handleNextQuestion = () => {
    if (currentIdx + 1 < (quizSession?.questions?.length || 0)) {
      setCurrentIdx(prev => prev + 1);
      setEvalResult(null);
      setSelectedOption(null);
      setUserAnswerText('');
      setTimeLeft(60);
      setTimerActive(true);
    }
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="page-header">
        <h1>📝 Automatic Question Generation & AI Quiz Mode</h1>
        <p>Generate practice exam questions by mark type or take interactive, timed AI quizzes with instant evaluation and weakness feedback.</p>
      </div>

      {/* Tabs */}
      <div className="mode-selector glass-card" style={{ padding: 12, marginBottom: 24 }}>
        <button 
          className={`mode-pill ${activeTab === 'interactive' ? 'active' : ''}`}
          onClick={() => setActiveTab('interactive')}
        >
          <Play size={16} /> Interactive AI Quiz Mode
        </button>
        <button 
          className={`mode-pill ${activeTab === 'generator' ? 'active' : ''}`}
          onClick={() => setActiveTab('generator')}
        >
          <FileQuestion size={16} /> Question Generator by Mark/Type
        </button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 20 }}>⚠️ {error}</div>}

      {/* Mode 1: Interactive AI Quiz */}
      {activeTab === 'interactive' && (
        <>
          {!quizSession ? (
            <div className="glass-card" style={{ padding: 28, maxWidth: 640 }}>
              <h3 style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={20} className="text-primary" /> Start AI Adaptive Quiz
              </h3>

              <div className="input-group" style={{ marginBottom: 16 }}>
                <label className="input-label">Subject</label>
                <input 
                  className="input" 
                  placeholder="e.g. Object Oriented Programming, DBMS"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                />
              </div>

              <div className="input-group" style={{ marginBottom: 16 }}>
                <label className="input-label">Topic / Unit</label>
                <input 
                  className="input" 
                  placeholder="e.g. Inheritance & Polymorphism, Exception Handling"
                  value={quizTopic}
                  onChange={e => setQuizTopic(e.target.value)}
                />
              </div>

              <div className="grid-2" style={{ marginBottom: 20 }}>
                <div className="input-group">
                  <label className="input-label">Number of Questions</label>
                  <input 
                    type="number" 
                    className="input" 
                    min="1" 
                    max="20"
                    value={questionCount}
                    onChange={e => setQuestionCount(parseInt(e.target.value) || 5)}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Countdown Timer</label>
                  <select 
                    className="input" 
                    value={timerEnabled ? 'yes' : 'no'} 
                    onChange={e => setTimerEnabled(e.target.value === 'yes')}
                  >
                    <option value="yes">Enable (60s per Question)</option>
                    <option value="no">Disable Timer</option>
                  </select>
                </div>
              </div>

              <button className="btn btn-primary btn-lg" onClick={handleStartQuiz} disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
                {loading ? <Sparkles className="spin" size={18} /> : <Play size={18} />}
                <span>Start AI Quiz Now</span>
              </button>
            </div>
          ) : (
            <div className="glass-card animate-fade-in" style={{ padding: 28 }}>
              {/* Header Stats & Timer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <span className="badge badge-primary" style={{ marginRight: 8 }}>
                    Question {currentIdx + 1} of {quizSession.questions.length}
                  </span>
                  <span className="badge badge-secondary">Subject: {quizSession.subject}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {timerEnabled && (
                    <div className={`quiz-timer ${timeLeft <= 10 ? 'alert-error' : ''}`}>
                      <Clock size={16} /> 00:{timeLeft < 10 ? `0${timeLeft}` : timeLeft}
                    </div>
                  )}
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                    Score: <span className="text-primary">{scoreBoard.correct}</span> / {scoreBoard.total}
                  </div>
                </div>
              </div>

              {/* Question Text */}
              <h3 style={{ marginBottom: 24, fontSize: '1.25rem', lineHeight: 1.5, color: 'var(--text-main)' }}>
                {quizSession.questions[currentIdx]?.question}
              </h3>

              {/* Options if MCQ */}
              {quizSession.questions[currentIdx]?.options && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                  {quizSession.questions[currentIdx].options.map((opt, i) => (
                    <button
                      key={i}
                      className={`glass-card ${selectedOption === i ? 'active-option' : ''}`}
                      onClick={() => !evalResult && setSelectedOption(i)}
                      style={{
                        padding: '16px 20px',
                        textAlign: 'left',
                        cursor: evalResult ? 'default' : 'pointer',
                        border: selectedOption === i ? '2px solid var(--primary)' : '1px solid var(--border)',
                        background: selectedOption === i ? 'var(--primary-subtle)' : 'var(--bg-surface-elevated)',
                        color: 'var(--text-main)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        width: '100%',
                        fontSize: '0.95rem'
                      }}
                    >
                      <strong style={{ minWidth: 24, color: selectedOption === i ? 'var(--primary)' : 'var(--text-main)', fontWeight: 700 }}>
                        {String.fromCharCode(65 + i)}.
                      </strong> 
                      <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>{opt}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Text answer if written question */}
              {!quizSession.questions[currentIdx]?.options && (
                <div className="input-group" style={{ marginBottom: 24 }}>
                  <label className="input-label" style={{ color: 'var(--text-main)' }}>Your Answer</label>
                  <textarea 
                    className="input" 
                    rows={4}
                    placeholder="Type your explanation here..."
                    value={userAnswerText}
                    onChange={e => setUserAnswerText(e.target.value)}
                    disabled={!!evalResult}
                    style={{ color: 'var(--text-main)', background: 'var(--bg-surface-elevated)' }}
                  />
                </div>
              )}

              {!evalResult ? (
                <button 
                  className="btn btn-primary" 
                  onClick={() => handleAnswerSubmit()}
                  disabled={evaluating}
                >
                  {evaluating ? <Sparkles className="spin" size={16} /> : <CheckCircle2 size={16} />}
                  <span>Submit Answer</span>
                </button>
              ) : (
                /* Evaluation Breakdown */
                <div className="glass-card animate-fade-in" style={{ padding: 20, marginTop: 20, background: 'var(--bg-surface-elevated)', borderLeft: `4px solid ${evalResult.is_correct ? '#10b981' : '#ef4444'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    {evalResult.is_correct ? (
                      <span className="badge badge-success" style={{ fontSize: '0.9rem' }}><CheckCircle2 size={14} /> Correct Answer! (+1 Score)</span>
                    ) : (
                      <span className="badge badge-danger" style={{ fontSize: '0.9rem' }}><XCircle size={14} /> Incorrect</span>
                    )}
                  </div>

                  <p style={{ marginBottom: 8, color: 'var(--text-main)' }}><strong style={{ color: 'var(--primary)' }}>Correct Answer:</strong> {evalResult.correct_answer}</p>
                  <p style={{ marginBottom: 8, color: 'var(--text-main)' }}><strong style={{ color: 'var(--primary)' }}>Explanation:</strong> {evalResult.explanation}</p>
                  
                  {evalResult.weakness_identified && evalResult.weakness_identified !== 'None' && (
                    <div className="alert alert-warning" style={{ marginTop: 12 }}>
                      ⚠️ <strong>Weakness Identified:</strong> {evalResult.weakness_identified}
                    </div>
                  )}

                  <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
                    {currentIdx + 1 < quizSession.questions.length ? (
                      <button className="btn btn-primary" onClick={handleNextQuestion}>
                        <span>Next Question</span> <ArrowRight size={16} />
                      </button>
                    ) : (
                      <button className="btn btn-secondary" onClick={() => setQuizSession(null)}>
                        <RefreshCw size={16} /> <span>Finish & Restart Quiz</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

            </div>
          )}
        </>
      )}

      {/* Mode 2: Question Generator */}
      {activeTab === 'generator' && (
        <div className="glass-card" style={{ padding: 28 }}>
          <h3 style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileQuestion size={20} className="text-primary" /> Automatic Question Paper Generator
          </h3>

          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div className="input-group">
              <label className="input-label">Subject / Topic</label>
              <input 
                className="input" 
                placeholder="e.g. Operating Systems Process Scheduling"
                value={topic}
                onChange={e => setTopic(e.target.value)}
              />
            </div>

            <div className="input-group">
              <label className="input-label">Question Category</label>
              <select className="input" value={questionType} onChange={e => setQuestionType(e.target.value)}>
                <option value="MCQs">MCQs (Multiple Choice Questions)</option>
                <option value="2-mark questions">2-Mark Short Questions</option>
                <option value="5-mark questions">5-Mark Conceptual Questions</option>
                <option value="10/15-mark questions">10/15-Mark Essay & Analytical Questions</option>
                <option value="Important questions">Important High-Yield Questions</option>
                <option value="Previous-year-style questions">Previous-Year Style Exam Questions</option>
              </select>
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: 20 }}>
            <div className="input-group">
              <label className="input-label">Marks Per Question</label>
              <input 
                type="number" 
                className="input" 
                value={markType}
                onChange={e => setMarkType(e.target.value)}
              />
            </div>

            <div className="input-group">
              <label className="input-label">Number of Questions</label>
              <input 
                type="number" 
                className="input" 
                min="1" 
                max="25"
                value={count}
                onChange={e => setCount(parseInt(e.target.value) || 5)}
              />
            </div>
          </div>

          <button className="btn btn-primary" onClick={handleGenerateQuestions} disabled={loading} style={{ marginBottom: 24 }}>
            {loading ? <Sparkles className="spin" size={16} /> : <FileQuestion size={16} />}
            <span>Generate Question Set</span>
          </button>

          {loading && <LoadingSpinner variant="bar" message="Generating questions from syllabus notes..." />}

          {generatedText && (
            <div className="glass-card animate-fade-in" style={{ padding: 24 }}>
              <h4 style={{ marginBottom: 16 }}>Generated Question Paper</h4>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{generatedText}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
