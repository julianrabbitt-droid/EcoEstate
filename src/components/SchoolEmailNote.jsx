import { GraduationCap } from 'lucide-react';

// Shown under Clerk's sign-in and sign-up forms.
export default function SchoolEmailNote() {
  return (
    <div className="mt-5 flex max-w-[400px] gap-2.5 rounded-2xl border border-border bg-card/80 px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
      <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <p>
        Use an email <em>or</em> a phone number — you only need one. Students and educators: sign up with your{' '}
        <span className="font-medium text-foreground">school email</span> to unlock the community and project tracking
        for free.
      </p>
    </div>
  );
}
