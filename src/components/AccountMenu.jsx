import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Crown, GraduationCap, Leaf, LogIn, LogOut, RefreshCw, User } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { usePremiumAccess } from '@/hooks/usePremiumAccess';
import { useAutoScanAccess } from '@/hooks/useAutoScanAccess';

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'ME';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

export default function AccountMenu() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { premium, threeD, loading, refresh } = usePremiumAccess();
  const autoAccess = useAutoScanAccess();
  const [checkingOut, setCheckingOut] = useState(false);

  const planLabel = premium ? 'Premium' : threeD ? 'Student 3D' : 'Free';
  const PlanIcon = premium ? Crown : threeD ? GraduationCap : Leaf;

  const handleUpgrade = async () => {
    setCheckingOut(true);
    sessionStorage.setItem('ecoestate_premium_pending', '1');
    try {
      const res = await base44.functions.invoke('create-checkout', { productId: 'premium' });
      const url = res?.data?.redirectUrl;
      if (url) window.location.href = url;
    } catch {
      setCheckingOut(false);
    }
  };

  const handleSignOut = async () => {
    await base44.auth.logout();
  };

  if (!isAuthenticated) {
    return (
      <Button variant="outline" onClick={() => navigate('/login')} className="h-9 rounded-full px-4 text-[13px]">
        <LogIn className="mr-1.5 h-4 w-4" /> Sign in
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-1.5 rounded-full px-2 sm:px-3">
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
                    ? 'Unlimited scans & 3D walk-through'
                    : threeD
                      ? 'Unlimited scans & 3D view'
                      : `${autoAccess.remaining} free scan${autoAccess.remaining === 1 ? '' : 's'} left this month`}
              </span>
            </div>
          </div>
        </div>
        {!premium && (
          <DropdownMenuItem onClick={handleUpgrade} disabled={checkingOut} className="gap-2">
            <Crown className="h-4 w-4 text-accent" />
            {checkingOut ? 'Opening checkout…' : 'Upgrade to Premium'}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => navigate('/projects')} className="gap-2">
          <User className="h-4 w-4" /> My properties
        </DropdownMenuItem>
        <DropdownMenuItem onClick={refresh} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh access
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="gap-2 text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}