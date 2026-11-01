import { SignIn } from "@clerk/clerk-react";
import { safeReturnTo } from "@/lib/authReturnTo";
import SchoolEmailNote from "@/components/SchoolEmailNote";
import GuestLink from "@/components/GuestLink";

export default function Login() {
  const returnTo = safeReturnTo();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-10">
      <SignIn
        routing="path"
        path="/login"
        signUpUrl="/register"
        fallbackRedirectUrl={returnTo}
      />
      <GuestLink />
      <SchoolEmailNote />
    </div>
  );
}
