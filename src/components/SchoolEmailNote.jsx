import { GraduationCap } from 'lucide-react';
import { Link } from 'react-router-dom';

// Shown under Clerk's sign-in and sign-up forms.
export default function SchoolEmailNote() {
  return (
    <>
      <div className="mt-5 flex max-w-[400px] gap-2.5 rounded-2xl border border-border bg-card/80 px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
        <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <p>
          Sign up with your email or Google. Students and educators: use your{' '}
          <span className="font-medium text-foreground">school email</span> to unlock the community and project tracking
          for free.
        </p>
      </div>
      <p className="mt-3 max-w-[400px] text-center text-[12px] text-muted-foreground">
        By continuing, you agree to EcoEstate’s{' '}
        <Link to="/terms" className="underline underline-offset-2">Terms of Service</Link> and{' '}
        <Link to="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.
      </p>
    </>
  );
}
