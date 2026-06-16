import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowRight, ArrowLeft, Shield } from 'lucide-react';

/**
 * Ultra-professional redirect page.
 * - If user is logged in: routes to the default dashboard.
 * - If not logged in: routes to /auth.
 */
const RedirectPage: React.FC = () => {
  const navigate = useNavigate();
  const { language, direction } = useLanguage();

  useEffect(() => {
    const go = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        navigate('/auth', { replace: true });
        return;
      }

      // Default entry point. You can later customize by role.
      navigate('/dashboard/employee', { replace: true });
    };

    go();
  }, [navigate]);

  const ArrowIcon = direction === 'rtl' ? ArrowLeft : ArrowRight;

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-success/10" />
      <div className="absolute -top-24 -right-24 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-success/10 rounded-full blur-3xl" />

      <Card className="relative z-10 w-full max-w-lg shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-primary flex items-center justify-center mb-3">
            <Shield className="w-6 h-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">
            {language === 'ar' ? 'بوابتك للموظفين' : 'Employee Portal'}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {language === 'ar'
              ? 'جارٍ التحقق من حسابك وتوجيهك إلى الصفحة المناسبة…'
              : 'Verifying your account and redirecting you to the right place…'}
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center gap-3 py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-foreground">
              {language === 'ar' ? 'جاري التحميل' : 'Loading'}
            </span>
            <ArrowIcon className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">
              {language === 'ar' ? 'ملاحظة' : 'Note'}
            </p>
            <p>
              {language === 'ar'
                ? 'إذا استمر التحميل، تأكد من اتصال الإنترنت أو أعد تسجيل الدخول.'
                : 'If this takes too long, check your internet connection or sign in again.'}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RedirectPage;
