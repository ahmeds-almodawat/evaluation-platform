import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { z } from 'zod';
import { useBranding } from '@/contexts/BrandingContext';
import { useLanguage } from '@/contexts/LanguageContext';

const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, 'Required')
    .refine((v) => !v.includes('@') || z.string().email().safeParse(v).success, {
      message: 'Invalid email address',
    }),
  password: z.string().min(1, 'Password is required'),
});

const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { language } = useLanguage();
  const { branding } = useBranding();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Login form
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        navigate('/redirect', { replace: true });
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/redirect', { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validation = loginSchema.safeParse({ identifier: loginIdentifier, password: loginPassword });
    if (!validation.success) {
      toast({
        title: 'Validation Error',
        description: validation.error.errors[0].message,
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
      // Prefer the standard anon key env var. Keep backwards-compat with older setups.
      const ANON_KEY =
        (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
        (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
        '';

      if (!SUPABASE_URL || !ANON_KEY) {
        throw new Error('Missing Supabase env (URL/ANON_KEY)');
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/api-v1/api/v1/auth/sign-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({ identifier: loginIdentifier, password: loginPassword }),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        const code = payload?.error?.code ?? payload?.code;
        const message = payload?.error?.message ?? payload?.message;

        // Keep credential failures generic, but surface server/config issues.
        if (code && String(code).toUpperCase().includes('SERVER_MISCONFIG')) {
          throw new Error(`SERVER_MISCONFIG: ${message ?? 'Server is missing env vars'}`);
        }
        throw new Error('INVALID_CREDENTIALS');
      }

      if (!payload?.access_token || !payload?.refresh_token) {
        throw new Error('INVALID_CREDENTIALS');
      }

      await supabase.auth.setSession({
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
      });

      toast({
        title: language === 'ar' ? 'مرحباً بعودتك!' : 'Welcome back!',
        description:
          language === 'ar' ? 'تم تسجيل الدخول بنجاح.' : 'You have been logged in successfully.',
      });
    } catch (err: any) {
      const msg = typeof err?.message === 'string' ? err.message : '';
      // Helpful console output for debugging in dev.
      // eslint-disable-next-line no-console
      console.error('Login failed', err);

      if (msg.startsWith('SERVER_MISCONFIG')) {
        toast({
          title: language === 'ar' ? 'خطأ في إعدادات الخادم' : 'Server Misconfigured',
          description:
            language === 'ar'
              ? 'المعرف/المفتاح غير مضبوط في Edge Functions. تأكد من إضافة SUPABASE_ANON_KEY.'
              : 'Edge Functions are missing env vars. Add SUPABASE_ANON_KEY in Supabase secrets.',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      toast({
        title: language === 'ar' ? 'فشل تسجيل الدخول' : 'Login Failed',
        description:
          language === 'ar'
            ? 'بيانات الدخول غير صحيحة أو الحساب غير نشط.'
            : 'Invalid credentials or inactive account.',
        variant: 'destructive',
      });
    }
    setLoading(false);

  };

  const pageStyle: React.CSSProperties = (() => {
    if (branding.backgroundType === 'solid') {
      return { background: branding.backgroundColor };
    }
    if (branding.backgroundType === 'image' && branding.backgroundImageDataUrl) {
      return {
        backgroundImage: `url(${branding.backgroundImageDataUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      };
    }
    return {
      background: `linear-gradient(135deg, ${branding.gradientFrom}, ${branding.gradientTo})`,
    };
  })();

  const cardBg = `rgba(255,255,255,${branding.cardOpacity})`;

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={pageStyle}>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            {branding.logoDataUrl ? (
              <img
                src={branding.logoDataUrl}
                alt="Logo"
                style={{ width: `${branding.logoWidthPx}px` }}
                className="object-contain"
              />
            ) : null}
          </div>
          <CardTitle
            className="font-bold"
            style={{
              fontSize: `${branding.titleSizePx}px`,
              fontFamily: language === 'ar' ? branding.fontAr : branding.fontEn,
              color: branding.titleColor,
            }}
          >
            {language === 'ar' ? branding.appNameAr : branding.appNameEn}
          </CardTitle>
          <CardDescription style={{ fontSize: `${branding.bodySizePx}px` }}>
            {language === 'ar' ? 'تسجيل الدخول' : 'Sign in'}
          </CardDescription>
        </CardHeader>
        <CardContent style={{ backgroundColor: cardBg }} className="rounded-b-lg">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-email">Email / البريد الإلكتروني</Label>
              <Input
                data-testid="login-identifier"
                id="login-email"
                type="text"
                placeholder="email@company.com"
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">Password / كلمة المرور</Label>
              <div className="relative">
                <Input
                  data-testid="login-password"
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <Button data-testid="login-submit" type="submit" className="w-full" style={{ backgroundColor: branding.primaryColor }} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Login / تسجيل الدخول
            </Button>
            <p className="text-center text-sm text-muted-foreground mt-4">
              Contact your administrator to get an account
              <br />
              تواصل مع المسؤول للحصول على حساب
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthPage;