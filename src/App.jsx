import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import ProtectedRoute from '@/components/ProtectedRoute';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import AppShell from '@/components/AppShell';
import ThankYou from './pages/ThankYou';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
// Add page imports here
import Scan from '@/pages/Scan';
import Analysis from '@/pages/Analysis';
import Design from '@/pages/Design';
import Impact from '@/pages/Impact';
import Plan from '@/pages/Plan';
import Legacy from '@/pages/Legacy';
import Projects from '@/pages/Projects';
import Social from '@/pages/Social';
import MyProjects from '@/pages/MyProjects';
import TrackedProject from '@/pages/TrackedProject';

// Community and Messages now live under Social; old links keep working.
function ToSocial({ tab }) {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set('tab', tab);
  return <Navigate to={`/social?${params}`} replace />;
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError?.type === 'user_not_registered') {
    return <UserNotRegisteredError />;
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/ThankYou" element={<ThankYou />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      {/* Add your page Route elements here */}
      <Route element={<AppShell />}>
        <Route path="/" element={<Scan />} />
        <Route path="/project/:id" element={<Analysis />} />
        <Route path="/project/:id/design" element={<Design />} />
        <Route path="/project/:id/impact" element={<Impact />} />
        <Route path="/project/:id/plan" element={<Plan />} />
        <Route path="/project/:id/legacy" element={<Legacy />} />
        <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
          <Route path="/projects" element={<Projects />} />
          <Route path="/my-projects" element={<MyProjects />} />
          <Route path="/my-projects/:id" element={<TrackedProject />} />
          <Route path="/social" element={<Social />} />
          <Route path="/community" element={<ToSocial tab="community" />} />
          <Route path="/messages" element={<ToSocial tab="messages" />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App