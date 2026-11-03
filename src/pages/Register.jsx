import { SignUp } from "@clerk/clerk-react";
import { safeReturnTo } from "@/lib/authReturnTo";
import SchoolEmailNote from "@/components/SchoolEmailNote";
import GuestLink from "@/components/GuestLink";
import { usePageMeta } from '@/hooks/usePageMeta';

export default function Register() {
  usePageMeta({ title: 'Create an account' });
  const returnTo = safeReturnTo();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-10">
      <SignUp
        routing="path"
        path="/register"
        signInUrl="/login"
        fallbackRedirectUrl={returnTo}
      />
      <GuestLink />
      <SchoolEmailNote />
    </div>
  );
}
