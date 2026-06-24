import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, User, X, ImageIcon } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useBranding } from '@/contexts/BrandingContext';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { Input } from '@/components/ui/input';
import NotificationDropdown from '@/components/notifications/NotificationDropdown';
import MessagesButton from '@/components/messages/MessagesButton';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import RoleSimulationBanner from '@/components/layout/RoleSimulationBanner';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

const Header: React.FC<HeaderProps> = ({ title, subtitle }) => {
  const { t, language } = useLanguage();
  const { role, user: supabaseUser, profile } = useSupabaseAuth();
  const canViewOwnScoresOnly = role === 'user';
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const { branding } = useBranding();
  const headerIcon = branding.headerIconDataUrl || branding.logoDataUrl || null;
  const headerIconSize = Math.max(16, Math.min(64, branding.headerIconWidthPx || 28));
  const [searchResults, setSearchResults] = useState<Array<{ id: string; nameEn: string; nameAr: string; staffId?: string | null; phone?: string | null }>>([]);
  const [isSearching, setIsSearching] = useState(false);

  const avatarInitial = useMemo(() => {
    const name = (language === 'ar' ? profile?.name_ar : profile?.name_en) || supabaseUser?.email || '';
    const trimmed = name.trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : 'U';
  }, [language, profile?.name_ar, profile?.name_en, supabaseUser?.email]);

  const handleUserClick = (userId: string) => {
    setShowSearchResults(false);
    setSearchQuery('');
    navigate(`/profile/${userId}`);
  };

  const handleProfileClick = () => {
    if (!supabaseUser?.id) {
      toast({ title: language === 'ar' ? 'تعذر فتح الملف الشخصي' : 'Unable to open profile', variant: 'destructive' });
      return;
    }
    // Use /profile/me so the profile page can resolve the correct record consistently.
    navigate(`/profile/me`);
  };

  // Live search (Supabase profiles)
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const q = searchQuery.trim();
      if (canViewOwnScoresOnly || q.length < 2) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      const pattern = `%${q}%`;
      const { data, error } = await supabase
        .from('profiles')
        .select('id,name_en,name_ar,staff_id,phone')
        .or(`name_en.ilike.${pattern},name_ar.ilike.${pattern},staff_id.ilike.${pattern},phone.ilike.${pattern}`)
        .limit(8);

      if (cancelled) return;
      if (error) {
        // Fail silently to avoid breaking header UI
        setSearchResults([]);
      } else {
        setSearchResults(
          (data || []).map((p: any) => ({
            id: p.id,
            nameEn: p.name_en || p.name_ar || 'Employee',
            nameAr: p.name_ar || p.name_en || 'موظف',
          }))
        );
      }
      setIsSearching(false);
    };

    const tmr = setTimeout(run, 250);
    return () => {
      cancelled = true;
      clearTimeout(tmr);
    };
  }, [searchQuery, canViewOwnScoresOnly, language]);


  return (
    <>
      <RoleSimulationBanner />
      <header className="h-16 bg-card border-b border-border px-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        {/* Header Icon */}
        <div className="flex items-center justify-center overflow-hidden rounded-lg border border-border bg-secondary/50"
             style={{ width: headerIconSize, height: headerIconSize }}>
          {headerIcon ? (
            <img src={headerIcon} alt="Header Icon" className="w-full h-full object-contain" />
          ) : (
            <ImageIcon className="w-5 h-5 text-muted-foreground" />
          )}
        </div>

        <div className="leading-tight">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--brand-title-color)' }}>{title}</h1>
          {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--brand-body-color)' }}>{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Search */}
        {!canViewOwnScoresOnly && (
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t('action.search')}
              className="w-64 pl-10 pr-8 bg-secondary border-transparent focus:border-primary"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSearchResults(true);
              }}
              onFocus={() => setShowSearchResults(true)}
              onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
            />
            {searchQuery && (
              <button
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setSearchQuery('');
                  setShowSearchResults(false);
                }}
              >
                <X className="w-4 h-4" />
              </button>
            )}
            
            {/* Search Results Dropdown */}
            {showSearchResults && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden">
                {searchResults.map((emp) => (
                  <button
                    key={emp.id}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left"
                    onMouseDown={() => handleUserClick(emp.id)}
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {language === 'ar' ? emp.nameAr : emp.nameEn}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {emp.staffId || emp.phone ? (
                          <>
                            {emp.staffId ? (language === 'ar' ? `رقم: ${emp.staffId}` : `ID: ${emp.staffId}`) : ''}
                            {emp.staffId && emp.phone ? ' • ' : ''}
                            {emp.phone ? (language === 'ar' ? `هاتف: ${emp.phone}` : `Phone: ${emp.phone}`) : ''}
                          </>
                        ) : (language === 'ar' ? 'عرض الملف الشخصي' : 'View Profile')}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            
            {showSearchResults && searchQuery && searchResults.length === 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 p-4 text-center text-muted-foreground text-sm">
                {language === 'ar' ? 'لا توجد نتائج' : 'No results found'}
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        <MessagesButton />

        {/* Notifications */}
        {/*
          Temporary safety guard:
          We observed an infinite update loop originating from Radix Popover/Popper while
          the Branding Designer page is mounted ("Maximum update depth exceeded").
          This blocks all inputs and makes branding appear "not functioning".
          To keep the platform usable, we disable the notifications popover only on
          the branding page route.
        */}
        {supabaseUser && !location.pathname.startsWith('/settings/branding') && (
          <NotificationDropdown />
        )}

        {/* User Avatar - Clickable */}
        <button
          onClick={handleProfileClick}
          className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-medium hover:opacity-90 transition-opacity"
        >
          {avatarInitial}
        </button>
      </div>
      </header>
    </>
  );
};

export default Header;