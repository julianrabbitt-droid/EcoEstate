import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, Crown, Gift, GraduationCap, Layers, Leaf, LogIn, LogOut, MessageSquare, RefreshCw, Sprout, Trash2, User } from 'lucide-react';
import { openFeedback } from '@/components/FeedbackButton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import RenewalTerms from '@/components/RenewalTerms';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { usePremiumAccess } from '@/hooks/usePremiumAccess';
import { openBillingPortal, savedReferral, startCheckout } from '@/lib/checkout';
import { loginPath } from '@/lib/authReturnTo';
import { toast } from '@/components/ui/use-toast';

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'ME';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

// overlay: the header sits over the home page's aerial photo (light text).
export default function AccountMenu({ overlay = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { premium, threeD, loading, refresh } = usePremiumAccess();
  const [checkingOut, setCheckingOut] = useState(false);
  // "Upgrade to Pro" first shows the renewal terms, then goes to checkout.
  const [confirmOpen, setConfirmOpen] = useState(false);
  // "Delete account" asks the person to type DELETE first.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await base44.auth.deleteMe();
      toast({ title: 'Your account was deleted', description: 'Your data is gone. Payment records are kept as the law requires.' });
      await base44.auth.logout('/');
    } catch (e) {
      setDeleting(false);
      toast({ variant: 'destructive', title: 'Couldn’t delete your account', description: e?.message || 'Please try again or email support@ecoestate.org.' });
    }
  };

  const planLabel = premium ? 'Pro' : threeD ? 'Student' : 'Free';
  const PlanIcon = premium ? Crown : threeD ? GraduationCap : Leaf;

  const handleUpgrade = async () => {
    setCheckingOut(true);
    sessionStorage.setItem('ecoestate_premium_pending', '1');
    try {
      const res = await startCheckout();
      const url = res?.data?.redirectUrl;
      if (url) window.location.href = url;
    } catch (e) {
      setCheckingOut(false);
      toast({ variant: 'destructive', title: 'Couldn’t open checkout', description: e?.message || 'Please try again.' });
    }
  };

  const handleManage = () => {
    openBillingPortal().catch((e) => {
      toast({ variant: 'destructive', title: 'Couldn’t open billing', description: e?.message || 'Please try again.' });
    });
  };

  const handleSignOut = async () => {
    await base44.auth.logout();
  };

  if (!isAuthenticated) {
    return (
      <Button
        variant="outline"
        onClick={() => navigate(loginPath(location))}
        title="Sign in to keep and track your properties"
        className={`h-9 rounded-full px-4 text-[13px] ${overlay ? 'border-white/60 bg-white/10 text-white backdrop-blur hover:bg-white/20 hover:text-white' : ''}`}
      >
        <LogIn className="mr-1.5 h-4 w-4" /> Sign in
      </Button>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-9 gap-1.5 rounded-full px-2 sm:px-3" aria-label="Account menu">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground">
              {user?.full_name ? initials(user.full_name) : <User className="h-3.5 w-3.5" />}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{user?.full_name || 'Account'}</span>
            <span className="truncate text-[11px] font-normal text-muted-foreground">{user?.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5">
            <div className="flex items-center gap-2 rounded-md bg-secondary/60 px-2.5 py-2">
              <PlanIcon className="h-4 w-4 text-accent" />
              <div className="flex flex-col">
                <span className="text-[12px] font-medium text-foreground">{planLabel} plan</span>
                <span className="text-[10px] text-muted-foreground">
                  {loading
                    ? 'Checking access…'
                    : premium
                      ? 'Community, tracking & exports'
                      : threeD
                        ? 'Community & project tracking'
                        : 'Free scans & 3D view'}
                </span>
              </div>
            </div>
          </div>
          {!premium && (
            <DropdownMenuItem onSelect={() => setConfirmOpen(true)} disabled={checkingOut} className="gap-2">
              <Crown className="h-4 w-4 text-accent" />
              {checkingOut ? 'Opening checkout…' : 'Upgrade to Pro'}
            </DropdownMenuItem>
          )}
          {premium && (
            <DropdownMenuItem onClick={handleManage} className="gap-2">
              <Crown className="h-4 w-4 text-accent" /> Manage subscription
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => navigate('/plans')} className="gap-2">
            <Layers className="h-4 w-4" /> Plans
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/invite')} className="gap-2">
            <Gift className="h-4 w-4" /> Invite friends — get a free month
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/projects')} className="gap-2">
            <User className="h-4 w-4" /> My properties
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/my-projects')} className="gap-2">
            <Sprout className="h-4 w-4" /> My projects
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openFeedback} className="gap-2">
            <MessageSquare className="h-4 w-4" /> Send feedback
          </DropdownMenuItem>
          {user?.role === 'admin' && (
            <DropdownMenuItem onClick={() => navigate('/admin')} className="gap-2">
              <Crown className="h-4 w-4" /> Owner dashboard
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={refresh} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh access
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} className="gap-2">
            <LogOut className="h-4 w-4" /> Sign out
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDeleteOpen(true)} className="gap-2 text-destructive focus:text-destructive">
            <Trash2 className="h-4 w-4" /> Delete account
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirmOpen} onOpenChange={(open) => !checkingOut && setConfirmOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upgrade to EcoEstate Pro</DialogTitle>
            <DialogDescription>Community, project tracking and exports.</DialogDescription>
          </DialogHeader>
          <RenewalTerms referral={!!savedReferral()} />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="rounded-full" onClick={() => setConfirmOpen(false)} disabled={checkingOut}>
              Cancel
            </Button>
            <Button className="rounded-full" onClick={handleUpgrade} disabled={checkingOut}>
              {checkingOut ? 'Opening checkout…' : 'Continue to checkout'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={deleteOpen} onOpenChange={(open) => !deleting && (setDeleteOpen(open), setDeleteText(''))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This permanently deletes your saved properties, tracked projects, photos, posts, comments and the messages
              you sent, cancels any Pro subscription, and closes your sign-in. Payment records are kept as the law
              requires. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <label className="text-[13px]" htmlFor="confirm-delete">
            Type <span className="font-mono font-medium">DELETE</span> to confirm
          </label>
          <input
            id="confirm-delete"
            value={deleteText}
            onChange={(e) => setDeleteText(e.target.value)}
            autoComplete="off"
            className="h-10 rounded-xl border border-border bg-background px-3 text-[14px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="rounded-full" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" className="rounded-full" onClick={handleDelete} disabled={deleting || deleteText !== 'DELETE'}>
              {deleting ? 'Deleting…' : 'Delete my account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}