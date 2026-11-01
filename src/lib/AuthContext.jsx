import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';
import { base44 } from '@/api/base44Client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const [user, setUser] = useState(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }

  const checkAppState = useCallback(async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      const publicSettings = await base44.app.getPublicSettings();
      setAppPublicSettings(publicSettings);
    } catch (appError) {
      console.error('App state check failed:', appError);
      if (appError.status === 403 && appError.data?.extra_data?.reason) {
        const reason = appError.data.extra_data.reason;
        setAuthError({
          type: reason,
          message: reason === 'auth_required' ? 'Authentication required'
            : reason === 'user_not_registered' ? 'User not registered for this app'
            : appError.message,
        });
      } else {
        setAuthError({ type: 'unknown', message: appError.message || 'Failed to load app' });
      }
    } finally {
      setIsLoadingPublicSettings(false);
    }
  }, []);

  // Fetch the app user (id, role, ...) from the API once Clerk says signed in.
  const checkUserAuth = useCallback(async () => {
    if (!isSignedIn) {
      setUser(null);
      setUserLoaded(true);
      return;
    }
    try {
      setUser(await base44.auth.me());
    } catch (error) {
      console.error('User auth check failed:', error);
      setUser(null);
      // Signed in with Clerk but our server didn't accept it: show an error
      // instead of sending them to /login (Clerk would bounce them straight
      // back, looping forever).
      if (error.status === 401 || error.status === 403) {
        setAuthError({ type: 'account_unavailable', message: 'We couldn’t load your EcoEstate account.' });
      }
    } finally {
      setUserLoaded(true);
    }
  }, [isSignedIn]);

  useEffect(() => {
    checkAppState();
  }, [checkAppState]);

  useEffect(() => {
    if (!isLoaded) return;
    setUserLoaded(false);
    checkUserAuth();
  }, [isLoaded, isSignedIn, checkUserAuth]);

  const authChecked = isLoaded && userLoaded;
  const isLoadingAuth = !authChecked;
  const isAuthenticated = authChecked && !!isSignedIn && !!user;

  const logout = (shouldRedirect = true) => {
    setUser(null);
    base44.auth.logout(shouldRedirect ? '/' : window.location.href);
  };

  const navigateToLogin = () => {
    // Use the SDK's redirectToLogin method
    base44.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
