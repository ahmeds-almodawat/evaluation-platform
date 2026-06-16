import React from 'react';
import { BarChart3 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useBranding } from '@/contexts/BrandingContext';

type Props = {
  message?: string;
};

const LoadingScreen: React.FC<Props> = ({ message }) => {
  const { language } = useLanguage();
  const { branding } = useBranding();

  const text =
    message ||
    (language === 'ar' ? 'جارٍ التحميل…' : 'Loading…');

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="w-full max-w-sm px-6 text-center">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center shadow-sm overflow-hidden">
          {branding.loadingGifDataUrl ? (
            <img src={branding.loadingGifDataUrl} alt="Loading" className="h-full w-full object-contain" />
          ) : (
            <BarChart3 className="h-8 w-8 text-primary" />
          )}
        </div>

        <div className="mt-4 text-xl font-semibold">
          {language === 'ar' ? (branding.appNameAr || 'ALMODAWAT') : (branding.appNameEn || 'ALMODAWAT')}
        </div>

        <div className="mt-2 text-sm text-muted-foreground">
          {text}
        </div>

        <div className="mt-6 h-2 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full w-1/2 rounded-full bg-primary animate-pulse" />
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;
