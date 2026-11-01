import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import App from '@/App.jsx'
import '@/index.css'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// Sign-up's legal-consent checkbox (enabled in Clerk) also confirms age and,
// for minors, parental permission. Placeholder syntax copied from Clerk's
// default en-US string.
const localization = {
  signUp: {
    legalConsent: {
      checkbox: {
        label__termsOfServiceAndPrivacyPolicy: `I am 13 or older, I agree to the {{ termsOfServiceLink || link("Terms of Service") }} and {{ privacyPolicyLink || link("Privacy Policy") }}, and if I'm under 18 I have a parent's or guardian's permission.`,
      },
    },
  },
}

const appearance = {
  variables: {
    colorPrimary: 'hsl(156, 34%, 15%)',
    colorBackground: 'hsl(0, 0%, 100%)',
    borderRadius: '0.75rem',
  },
}

const root = ReactDOM.createRoot(document.getElementById('root'))

if (!publishableKey) {
  root.render(
    <div style={{ padding: 32, fontFamily: 'sans-serif' }}>
      Sign-in is not configured: VITE_CLERK_PUBLISHABLE_KEY is missing.
    </div>
  )
} else {
  root.render(
    <ClerkProvider
      publishableKey={publishableKey}
      afterSignOutUrl="/"
      signInUrl="/login"
      signUpUrl="/register"
      appearance={appearance}
      localization={localization}
    >
      <App />
    </ClerkProvider>
  )
}
