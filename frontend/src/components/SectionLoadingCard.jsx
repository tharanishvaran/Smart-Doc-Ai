import { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Award, 
  Search, 
  Target, 
  FileText, 
  Brain, 
  Zap, 
  Layers 
} from 'lucide-react';
import './SectionLoadingCard.css';

const THEME_CONFIGS = {
  dashboard: {
    badge: 'Neural Sync',
    colorName: 'dashboard',
    initial: {
      title: 'Syncing Knowledge & Analytics',
      steps: [
        { label: 'Connecting to Vector Knowledge Base...', detail: 'Verifying indexed documents and storage health' },
        { label: 'Aggregating Study Performance Metrics...', detail: 'Calculating retention scores, quiz mastery & session history' },
        { label: 'Rendering SmartDoc AI Dashboard...', detail: 'Assembling live workspace widgets and quick actions' },
      ],
    },
    action: {
      title: 'Updating AI Intelligence Engine',
      steps: [
        { label: 'Refreshing Workspace State...', detail: 'Querying latest sync telemetry' },
        { label: 'Re-indexing Recent Activity...', detail: 'Synchronizing newly added documents' },
        { label: 'Finalizing Analytics Summary...', detail: 'Updating performance graphs and stats' },
      ],
    },
  },
  quiz: {
    badge: 'Cognitive AI',
    colorName: 'quiz',
    initial: {
      title: 'Initializing AI Quiz Mode',
      steps: [
        { label: 'Scanning Question Archives...', detail: 'Querying document taxonomy and quiz records' },
        { label: 'Calibrating Cognitive Difficulty...', detail: 'Preparing adaptive multi-choice question matrices' },
        { label: 'Readying Interactive Studio...', detail: 'Configuring timer, streak tracking and hint engine' },
      ],
    },
    action: {
      title: 'Synthesizing AI Quiz with Gemini',
      steps: [
        { label: 'Extracting Core Curriculum Concepts...', detail: 'Isolating key laws, definitions and analytical themes' },
        { label: 'Engineering Plausible Distractors...', detail: 'Generating high-yield MCQ options with subtle nuances' },
        { label: 'Formulating Grounded Explanations...', detail: 'Verifying answers against uploaded textbook sources' },
      ],
    },
  },
  analysis: {
    badge: 'Pattern Engine',
    colorName: 'analysis',
    initial: {
      title: 'Loading Question Analysis Studio',
      steps: [
        { label: 'Accessing Document Repositories...', detail: 'Querying indexed exam papers & syllabi' },
        { label: 'Calibrating OCR & Semantic Models...', detail: 'Loading frequency comparison neural weights' },
        { label: 'Readying Paper Analysis Matrix...', detail: 'Preparing topic weight charts and prediction tables' },
      ],
    },
    action: {
      title: 'Deep RAG Paper Pattern Mining',
      steps: [
        { label: 'OCR Parsing & Chunk Alignment...', detail: 'Segmenting past year questions, marks & unit breakdown' },
        { label: 'Mining Recurring Topic Frequencies...', detail: 'Detecting repeated 2-mark, 5-mark and 15-mark patterns' },
        { label: 'Predicting High-Probability Exam Questions...', detail: 'Generating expected exam questions with confidence scores' },
      ],
    },
  },
  examprep: {
    badge: 'Exam Strategist',
    colorName: 'examprep',
    initial: {
      title: 'Assembling Exam Preparation Studio',
      steps: [
        { label: 'Loading Course Curriculum & Notes...', detail: 'Reviewing subject modules and indexed chapters' },
        { label: 'Mapping High-Yield Syllabus Weights...', detail: 'Structuring prioritized revision timeline matrix' },
        { label: 'Readying Revision Roadmap...', detail: 'Preparing daily target schedule and key formula sheets' },
      ],
    },
    action: {
      title: 'Formulating High-Yield Exam Strategy',
      steps: [
        { label: 'Analyzing Exam Syllabus & Past Weightage...', detail: 'Isolating critical scoring chapters and units' },
        { label: 'Synthesizing Must-Know Formulas & Definitions...', detail: 'Extracting essential derivations and summaries' },
        { label: 'Compiling Actionable Study Milestones...', detail: 'Structuring realistic study roadmap and self-tests' },
      ],
    },
  },
};

export default function SectionLoadingCard({
  theme = 'dashboard',
  mode = 'initial',
  title,
  subtitle,
  steps: customSteps,
  fullPage = false,
  className = '',
}) {
  const [currentStep, setCurrentStep] = useState(0);

  const config = THEME_CONFIGS[theme] || THEME_CONFIGS.dashboard;
  const activePreset = config[mode] || config.initial;
  const displaySteps = customSteps || activePreset.steps;
  const displayTitle = title || activePreset.title;

  // Cycle smoothly through the 3 pipeline steps
  useEffect(() => {
    setCurrentStep(0);
    const t1 = setTimeout(() => setCurrentStep(1), 1100);
    const t2 = setTimeout(() => setCurrentStep(2), 2400);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [theme, mode]);

  const renderThemedIcon = () => {
    if (theme === 'dashboard') {
      return (
        <div className="section-logo-orbit">
          <div className="orbit-spin-halo" />
          <div className="section-logo-bubble">
            <img src="/logo-transparent.png" alt="SmartDoc AI" className="section-logo-img" />
          </div>
        </div>
      );
    }
    if (theme === 'quiz') {
      return (
        <div className="section-logo-orbit theme-quiz-orbit">
          <div className="orbit-spin-halo" />
          <div className="section-logo-bubble theme-quiz-bubble">
            <Brain size={30} className="section-themed-icon" />
          </div>
        </div>
      );
    }
    if (theme === 'analysis') {
      return (
        <div className="section-logo-orbit theme-analysis-orbit">
          <div className="orbit-spin-halo" />
          <div className="section-logo-bubble theme-analysis-bubble">
            <Search size={28} className="section-themed-icon" />
          </div>
        </div>
      );
    }
    // examprep
    return (
      <div className="section-logo-orbit theme-examprep-orbit">
        <div className="orbit-spin-halo" />
        <div className="section-logo-bubble theme-examprep-bubble">
          <Target size={30} className="section-themed-icon" />
        </div>
      </div>
    );
  };

  return (
    <div className={`section-loader-wrapper ${fullPage ? 'full-page-mode' : ''} ${className}`}>
      <div className={`section-loader-card glass-card theme-${config.colorName} animate-fade-in`}>
        {/* Holographic Laser Sweep Beam */}
        <div className="section-laser-sweep" />

        {/* Top Header Row with Themed Icon & Status Pill */}
        <div className="section-loader-header">
          {renderThemedIcon()}
          <div className="section-loader-title-group">
            <div className="section-badge-row">
              <span className="section-status-badge">
                <Sparkles size={11} className="section-spin-sparkle" />
                <span>{config.badge} Active</span>
              </span>
              <span className="section-live-indicator">
                <span className="live-ping-dot" />
                <span>RAG Streaming</span>
              </span>
            </div>
            <h3 className="section-loader-title">{displayTitle}</h3>
          </div>
        </div>

        {/* 3-Step Live Progress Pipeline Tracker */}
        <div className="section-pipeline-stepper">
          <div className={`stepper-node ${currentStep >= 0 ? 'active' : ''} ${currentStep > 0 ? 'done' : ''}`}>
            <span className="stepper-dot" />
            <span className="stepper-text">{displaySteps[0]?.label.split('...')[0]}</span>
          </div>
          <div className={`stepper-connector ${currentStep >= 1 ? 'active' : ''}`} />
          <div className={`stepper-node ${currentStep >= 1 ? 'active' : ''} ${currentStep > 1 ? 'done' : ''}`}>
            <span className="stepper-dot" />
            <span className="stepper-text">{displaySteps[1]?.label.split('...')[0]}</span>
          </div>
          <div className={`stepper-connector ${currentStep >= 2 ? 'active' : ''}`} />
          <div className={`stepper-node ${currentStep >= 2 ? 'active' : ''}`}>
            <span className="stepper-dot" />
            <span className="stepper-text">{displaySteps[2]?.label.split('...')[0]}</span>
          </div>
        </div>

        {/* Equalizer & Dynamic Progress Detail */}
        <div className="section-loader-body">
          <div className="section-neural-equalizer">
            <span className="eq-bar eq-1" />
            <span className="eq-bar eq-2" />
            <span className="eq-bar eq-3" />
            <span className="eq-bar eq-4" />
            <span className="eq-bar eq-5" />
            <span className="eq-bar eq-6" />
            <span className="eq-bar eq-7" />
          </div>
          <div className="section-step-status-text">
            <div className="current-step-label">
              {displaySteps[currentStep]?.label}
            </div>
            <div className="current-step-detail">
              {subtitle || displaySteps[currentStep]?.detail}
            </div>
          </div>
        </div>

        {/* Multi-tier Shimmer Tracks */}
        <div className="section-shimmer-tracks">
          <div className="shimmer-line line-wide" />
          <div className="shimmer-line line-mid" />
          <div className="shimmer-line line-slim" />
        </div>
      </div>
    </div>
  );
}
