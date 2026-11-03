import { Link } from 'react-router-dom';
import { usePageMeta } from '@/hooks/usePageMeta';

// create-checkout sends buyers to this page after they pay.
export default function ThankYou() {
  usePageMeta({ title: 'Thank you' });
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-3xl font-semibold">Thank you for your purchase</h1>
        <p className="text-muted-foreground">
          Your payment was received. EcoEstate Pro (community, project tracking and exports) unlocks in a moment.
        </p>
        <Link to="/projects" className="inline-block rounded-md bg-primary px-5 py-2 text-primary-foreground">
          Back to my properties
        </Link>
      </div>
    </main>
  );
}