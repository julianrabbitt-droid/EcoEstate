import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, LogIn, Mail, Lock, UserPlus } from 'lucide-react';
import AuthTabs from '@/components/AuthTabs';
import GoogleIcon from '@/components/GoogleIcon';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';
import { safeReturnTo } from '@/lib/authReturnTo';

const DISMISSED_KEY = 'ecoestate_auth_prompt_dismissed';

// Auto-pops a login / sign-up dialog for guests on first load. The built-in X
// closes it so the visitor can continue as a guest for the session.
export default function AuthModal() {
  const { isAuthenticated, authChecked } = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('login');

  useEffect(() => {
    if (!authChecked) return;
    if (isAuthenticated) { setOpen(false); return; }
    if (!sessionStorage.getItem(DISMISSED_KEY)) setOpen(true);
  }, [authChecked, isAuthenticated]);

  const close = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent className="max-w-md p-8">
        <DialogTitle className="sr-only">Sign in to EcoEstate</DialogTitle>
        <AuthTabs active={tab} returnTo={safeReturnTo()} onSwitch={setTab} />
        {tab === 'login' ? <LoginForm onDone={() => setOpen(false)} /> : <SignupForm onSwitch={setTab} />}
        <p className="text-center text-[12px] leading-relaxed text-muted-foreground">
          Students and educators: sign in with a verified school email to unlock the Full Auto Scan,
          interactive 3D Garden View, and walk-through at no cost.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function GoogleButton({ onClick }) {
  return (
    <Button variant="outline" className="w-full h-12 text-sm font-medium mb-6" onClick={onClick}>
      <GoogleIcon className="w-5 h-5 mr-2" />
      Continue with Google
    </Button>
  );
}

function Divider() {
  return (
    <div className="relative mb-6">
      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-background px-3 text-muted-foreground">or</span>
      </div>
    </div>
  );
}

function ErrorBox({ children }) {
  if (!children) return null;
  return <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{children}</div>;
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const returnTo = safeReturnTo();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await base44.auth.loginViaEmailPassword(email, password);
      window.location.href = returnTo;
    } catch (err) {
      setError(err.message || 'Invalid email or password');
      setLoading(false);
    }
  };

  return (
    <>
      <GoogleButton onClick={() => base44.auth.loginWithProvider('google', returnTo)} />
      <Divider />
      <ErrorBox>{error}</ErrorBox>
      <form onSubmit={submit} className="space-y-4">
        <Field id="email" label="Email" icon={Mail} value={email} onChange={setEmail} type="email" placeholder="you@example.com" />
        <Field id="password" label="Password" icon={Lock} value={password} onChange={setPassword} type="password" placeholder="••••••••" />
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Logging in...</> : <><LogIn className="w-4 h-4 mr-2" />Log in</>}
        </Button>
      </form>
    </>
  );
}

function SignupForm({ onSwitch }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const returnTo = safeReturnTo();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      await base44.auth.register({ email, password });
      setShowOtp(true);
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await base44.auth.verifyOtp({ email, otpCode });
      if (result?.access_token) base44.auth.setToken(result.access_token);
      window.location.href = returnTo;
    } catch (err) {
      setError(err.message || 'Invalid verification code');
      setLoading(false);
    }
  };

  const resend = async () => {
    try {
      await base44.auth.resendOtp(email);
      toast({ title: 'Code sent', description: 'Check your email for the new code.' });
    } catch (err) {
      setError(err.message || 'Failed to resend code');
    }
  };

  if (showOtp) {
    return (
      <>
        <ErrorBox>{error}</ErrorBox>
        <p className="text-center text-sm text-muted-foreground">We sent a code to {email}</p>
        <div className="flex justify-center my-6">
          <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode} autoFocus autoComplete="one-time-code">
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}
            </InputOTPGroup>
          </InputOTP>
        </div>
        <Button className="w-full h-12 font-medium" onClick={verify} disabled={loading || otpCode.length < 6}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verifying...</> : 'Verify'}
        </Button>
        <p className="text-center text-sm text-muted-foreground mt-4">
          Didn't receive the code?{' '}
          <button onClick={resend} className="text-primary font-medium hover:underline">Resend</button>
        </p>
      </>
    );
  }

  return (
    <>
      <GoogleButton onClick={() => base44.auth.loginWithProvider('google', returnTo)} />
      <Divider />
      <ErrorBox>{error}</ErrorBox>
      <form onSubmit={submit} className="space-y-4">
        <Field id="su-email" label="Email" icon={Mail} value={email} onChange={setEmail} type="email" placeholder="you@example.com" />
        <Field id="su-password" label="Password" icon={Lock} value={password} onChange={setPassword} type="password" placeholder="••••••••" />
        <Field id="su-confirm" label="Confirm Password" icon={Lock} value={confirmPassword} onChange={setConfirmPassword} type="password" placeholder="••••••••" />
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating account...</> : <><UserPlus className="w-4 h-4 mr-2" />Create account</>}
        </Button>
      </form>
    </>
  );
}

function Field({ id, label, icon: Icon, value, onChange, type, placeholder }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
        <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-10 h-12" required />
      </div>
    </div>
  );
}