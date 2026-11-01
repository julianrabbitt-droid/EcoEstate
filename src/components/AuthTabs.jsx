import { Link } from 'react-router-dom';

// Tab switcher for the auth pages: Log in / Sign up. On the full auth pages the
// inactive tab links to the other route; inside the modal an onSwitch callback
// swaps the form instead. returnTo is carried along for the link variant.
export default function AuthTabs({ active, returnTo, onSwitch }) {
  const query = returnTo && returnTo !== '/' ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
  const base = 'flex-1 text-center text-sm font-medium py-2 rounded-md transition';
  const on = 'bg-primary text-primary-foreground';
  const off = 'text-muted-foreground hover:text-foreground';

  const renderTab = (key, label, target) => {
    if (active === key) return <span className={`${base} ${on}`}>{label}</span>;
    if (onSwitch) return <button type="button" onClick={() => onSwitch(key)} className={`${base} ${off}`}>{label}</button>;
    return <Link to={`${target}${query}`} className={`${base} ${off} block`}>{label}</Link>;
  };

  return (
    <div className="flex rounded-lg border border-border p-1 mb-6 bg-secondary/40">
      {renderTab('login', 'Log in', '/login')}
      {renderTab('signup', 'Sign up', '/register')}
    </div>
  );
}