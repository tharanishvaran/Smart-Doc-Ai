import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import './index.css';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Documents from './pages/Documents';
import Chat from './pages/Chat';
import QuestionAnalysis from './pages/QuestionAnalysis';
import ExamPrep from './pages/ExamPrep';
import QuizMode from './pages/QuizMode';
import Profile from './pages/Profile';

// Layout
import AppLayout from './components/AppLayout';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>;
  return user ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>;
  return user ? <Navigate to="/dashboard" replace /> : children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />

      {/* Protected */}
      <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="documents" element={<Documents />} />
        <Route path="chat" element={<Chat />} />
        <Route path="chat/:sessionId" element={<Chat />} />
        <Route path="exam-prep" element={<ExamPrep />} />
        <Route path="quiz" element={<QuizMode />} />
        <Route path="analysis" element={<QuestionAnalysis />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}


export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
