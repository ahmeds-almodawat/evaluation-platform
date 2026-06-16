import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/contexts/LanguageContext';
import { useBranding } from '@/contexts/BrandingContext';
import { BRANDING_PAGE_OPTIONS, type BrandingPageKey } from '@/lib/pageBranding';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { useToast } from '@/hooks/use-toast';
import { Paintbrush, ImageIcon, RotateCcw, Save, ArrowLeft, Sparkles } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';


const MAX_IMG_MB = 2;

function isDataUrl(value?: string) {
  return Boolean(value && value.startsWith('data:'));
}

function guessExtFromDataUrl(dataUrl: string) {
  const m = /^data:([^;]+);/i.exec(dataUrl);
  const mime = (m?.[1] || 'image/png').toLowerCase();
  if (mime.includes('svg')) return 'svg';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('ico')) return 'ico';
  return 'png';
}

async function uploadDataUrlToBrandingBucket(dataUrl: string, key: string) {
  if (!isSupabaseConfigured) return dataUrl;
  const blob = await (await fetch(dataUrl)).blob();
  const ext = guessExtFromDataUrl(dataUrl);
  const path = `assets/${key}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('branding').upload(path, blob, {
    upsert: false,
    contentType: blob.type || undefined,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('branding').getPublicUrl(path);
  return data.publicUrl;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

const BrandingSettingsPage: React.FC = () => {
  const { language } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { role } = useSupabaseAuth();
  const { branding, setBranding, resetBranding, getPageOverride, setPageOverride, resetPageOverride } = useBranding();

  const [pageKey, setPageKey] = useState<BrandingPageKey>('login');
  const [saving, setSaving] = useState(false);

  const [draft, setDraft] = useState(() => ({ ...branding }));
  const logoRef = useRef<HTMLInputElement>(null);
  const bgRef = useRef<HTMLInputElement>(null);
  const faviconRef = useRef<HTMLInputElement>(null);
  const headerIconRef = useRef<HTMLInputElement>(null);
  const loadingGifRef = useRef<HTMLInputElement>(null);

  const isAdmin = role === 'admin' || role === 'super_user';

  React.useEffect(() => {
    // reload draft when page changes
    if (pageKey === 'general') {
      setDraft({ ...branding });
      return;
    }
    const override = getPageOverride(pageKey);
    setDraft({ ...branding, ...override } as any);
  }, [pageKey, branding]);


  const selectedPageLabel = useMemo(() => {
    const opt = BRANDING_PAGE_OPTIONS.find((o) => o.key === pageKey);
    return language === 'ar' ? opt?.labelAr : opt?.labelEn;
  }, [language, pageKey]);

  const title = language === 'ar' ? `مصمم الهوية البصرية: ${selectedPageLabel}` : `Branding Designer: ${selectedPageLabel}`;
  const subtitle = language === 'ar'
    ? 'تحكم بالألوان والخطوط والخلفية مع معاينة قبل الحفظ (للمسؤول فقط)'
    : 'Control colors, fonts & background with a live preview (Admin only).';

  const previewStyle = useMemo(() => {
    if (draft.backgroundType === 'solid') {
      return { background: draft.backgroundColor } as React.CSSProperties;
    }
    if (draft.backgroundType === 'image' && draft.backgroundImageDataUrl) {
      return {
        backgroundImage: `url(${draft.backgroundImageDataUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      } as React.CSSProperties;
    }
    return {
      background: `linear-gradient(135deg, ${draft.gradientFrom}, ${draft.gradientTo})`,
    } as React.CSSProperties;
  }, [draft]);

  const validateImage = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: language === 'ar' ? 'ملف غير صالح' : 'Invalid file',
        description: language === 'ar' ? 'يرجى اختيار صورة فقط' : 'Please choose an image file.',
        variant: 'destructive',
      });
      return false;
    }
    if (file.size > MAX_IMG_MB * 1024 * 1024) {
      toast({
        title: language === 'ar' ? 'الصورة كبيرة' : 'Image is too large',
        description: language === 'ar' ? `الحد الأقصى ${MAX_IMG_MB}MB` : `Max size is ${MAX_IMG_MB}MB`,
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  const onPickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!validateImage(file)) return;
    const url = await fileToDataUrl(file);
    setDraft((d) => ({ ...d, logoDataUrl: url }));
  };

  const onPickBg = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!validateImage(file)) return;
    const url = await fileToDataUrl(file);
    setDraft((d) => ({ ...d, backgroundImageDataUrl: url, backgroundType: 'image' }));
  };


  const onPickFavicon = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!validateImage(file)) return;
    const url = await fileToDataUrl(file);
    setDraft((d) => ({ ...d, faviconDataUrl: url }));
  };

  const onPickHeaderIcon = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!validateImage(file)) return;
    const url = await fileToDataUrl(file);
    setDraft((d) => ({ ...d, headerIconDataUrl: url }));
  };

  const onPickLoadingGif = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!validateImage(file)) return;
    const url = await fileToDataUrl(file);
    setDraft((d) => ({ ...d, loadingGifDataUrl: url }));
  };


  const onSave = async () => {
    try {
      setSaving(true);

      // If the user picked a new image, draft contains a base64 data URL.
      // Upload those to Storage so other devices can see them.
      const next: any = { ...draft };
      if (isDataUrl(next.logoDataUrl)) {
        next.logoDataUrl = await uploadDataUrlToBrandingBucket(next.logoDataUrl, `${pageKey}_logo`);
      }
      if (isDataUrl(next.faviconDataUrl)) {
        next.faviconDataUrl = await uploadDataUrlToBrandingBucket(next.faviconDataUrl, `${pageKey}_favicon`);
      }
      if (isDataUrl(next.headerIconDataUrl)) {
        next.headerIconDataUrl = await uploadDataUrlToBrandingBucket(next.headerIconDataUrl, `${pageKey}_headericon`);
      }
      if (isDataUrl(next.loadingGifDataUrl)) {
        next.loadingGifDataUrl = await uploadDataUrlToBrandingBucket(next.loadingGifDataUrl, `${pageKey}_loading`);
      }
      if (next.backgroundType === 'image' && isDataUrl(next.backgroundImageDataUrl)) {
        next.backgroundImageDataUrl = await uploadDataUrlToBrandingBucket(next.backgroundImageDataUrl, `${pageKey}_bg`);
      }

      if (pageKey === 'general') {
        await setBranding(next);
      } else {
        await setPageOverride(pageKey, next);
      }

      toast({
        title: language === 'ar' ? 'تم الحفظ' : 'Saved',
        description:
          language === 'ar'
            ? `تم تطبيق التخصيص على صفحة: ${selectedPageLabel}`
            : `Branding applied to: ${selectedPageLabel}`,
      });
    } catch (e: any) {
      console.error('[Branding] Save failed', e);
      toast({
        title: language === 'ar' ? 'فشل الحفظ' : 'Save failed',
        description: e?.message || String(e),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const onReset = async () => {
    try {
      setSaving(true);
      if (pageKey === 'general') {
        await resetBranding();
        setDraft({ ...branding });
      } else {
        await resetPageOverride(pageKey);
        setDraft({ ...branding });
      }
      toast({
        title: language === 'ar' ? 'تمت الإعادة' : 'Reset',
        description:
          language === 'ar'
            ? `تمت إعادة الإعدادات الافتراضية لصفحة: ${selectedPageLabel}`
            : `Default branding restored for: ${selectedPageLabel}`,
      });
    } catch (e: any) {
      console.error('[Branding] Reset failed', e);
      toast({
        title: language === 'ar' ? 'فشل' : 'Failed',
        description: e?.message || String(e),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header title={title} subtitle={subtitle} />
        <main className="container mx-auto px-4 py-10">
          <Card className="max-w-xl mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Paintbrush className="h-4 w-4" />
                {language === 'ar' ? 'غير مصرح' : 'Access denied'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {language === 'ar'
                  ? 'هذه الصفحة متاحة للمسؤول فقط.'
                  : 'This page is available for Admin/Super User only.'}
              </p>
              <Button onClick={() => navigate('/settings')} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                {language === 'ar' ? 'رجوع' : 'Back'}
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header title={title} subtitle={subtitle} />

      <main className="container mx-auto px-4 pb-10">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Controls */}
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                {language === 'ar' ? 'الإعدادات' : 'Settings'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Page Selector */}
              <div className="grid gap-2">
                <Label>{language === 'ar' ? 'اختر الصفحة' : 'Select page'}</Label>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={pageKey}
                  onChange={(e) => setPageKey(e.target.value as BrandingPageKey)}
                >
                  {BRANDING_PAGE_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {language === 'ar' ? opt.labelAr : opt.labelEn}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {language === 'ar'
                    ? 'يمكنك تخصيص كل صفحة بشكل مستقل مع معاينة فورية.'
                    : 'You can customize each page independently with a live preview.'}
                </p>
              </div>

              <div className="grid gap-3">
                <Label>{language === 'ar' ? 'اسم التطبيق (إنجليزي)' : 'App name (English)'}</Label>
                <Input value={draft.appNameEn} onChange={(e) => setDraft((d) => ({ ...d, appNameEn: e.target.value }))} />
                <Label>{language === 'ar' ? 'اسم التطبيق (عربي)' : 'App name (Arabic)'}</Label>
                <Input value={draft.appNameAr} onChange={(e) => setDraft((d) => ({ ...d, appNameAr: e.target.value }))} />
              </div>

              <div className="grid gap-3">
                <Label>{language === 'ar' ? 'الشعار' : 'Logo'}</Label>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="outline" className="gap-2" onClick={() => logoRef.current?.click()}>
                    <ImageIcon className="h-4 w-4" />
                    {language === 'ar' ? 'رفع شعار' : 'Upload logo'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setDraft((d) => ({ ...d, logoDataUrl: undefined }))}>
                    {language === 'ar' ? 'حذف' : 'Remove'}
                  </Button>
                  <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={onPickLogo} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {language === 'ar' ? 'عرض الشعار (بالبكسل)' : 'Logo width (px)'}
                  </Label>
                  <Input
                    type="number"
                    min={80}
                    max={360}
                    value={draft.logoWidthPx}
                    onChange={(e) => setDraft((d) => ({ ...d, logoWidthPx: Number(e.target.value || 180) }))}
                  />
                </div>
              </div>

              
              {/* Header Icon + Favicon */}
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label className="text-xs text-muted-foreground">
                    {language === 'ar' ? 'أيقونة العنوان (تظهر بجانب عنوان الصفحة)' : 'Header icon (next to page title)'}
                  </Label>
                  <div className="flex items-center gap-3">
                    <div
                      className="rounded-lg border border-border bg-secondary/40 flex items-center justify-center overflow-hidden"
                      style={{ width: Math.max(16, Math.min(64, draft.headerIconWidthPx || 28)), height: Math.max(16, Math.min(64, draft.headerIconWidthPx || 28)) }}
                    >
                      {draft.headerIconDataUrl ? (
                        <img src={draft.headerIconDataUrl} alt="Header icon" className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-xs text-muted-foreground">{language === 'ar' ? 'لا يوجد' : 'None'}</span>
                      )}
                    </div>
                    <Button type="button" variant="secondary" onClick={() => headerIconRef.current?.click()}>
                      {language === 'ar' ? 'تحميل' : 'Upload'}
                    </Button>
                    <Input
                      type="number"
                      min={16}
                      max={64}
                      value={draft.headerIconWidthPx}
                      onChange={(e) => setDraft((d) => ({ ...d, headerIconWidthPx: Number(e.target.value || 28) }))}
                      className="w-28"
                    />
                    <span className="text-xs text-muted-foreground">px</span>
                  </div>
                  <input ref={headerIconRef} type="file" accept="image/*" className="hidden" onChange={onPickHeaderIcon} />
                </div>

                <div className="grid gap-2">
                  <Label className="text-xs text-muted-foreground">
                    {language === 'ar' ? 'أيقونة المتصفح (Favicon)' : 'Browser tab icon (Favicon)'}
                  </Label>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg border border-border bg-secondary/40 flex items-center justify-center overflow-hidden">
                      {draft.faviconDataUrl ? (
                        <img src={draft.faviconDataUrl} alt="Favicon" className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-xs text-muted-foreground">{language === 'ar' ? 'لا يوجد' : 'None'}</span>
                      )}
                    </div>
                    <Button type="button" variant="secondary" onClick={() => faviconRef.current?.click()}>
                      {language === 'ar' ? 'تحميل' : 'Upload'}
                    </Button>
                    <input ref={faviconRef} type="file" accept="image/*" className="hidden" onChange={onPickFavicon} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {language === 'ar' ? 'قد تحتاج إلى تحديث قوي (Ctrl+Shift+R) لرؤية التغيير.' : 'You may need a hard refresh (Ctrl+Shift+R) to see updates.'}
                  </p>
                </div>

                {/* Loading GIF */}
                <div className="grid gap-2">
                  <Label className="text-xs text-muted-foreground">
                    {language === 'ar'
                      ? 'صورة التحميل (GIF) بدل الشاشة البيضاء'
                      : 'Loading image (GIF) instead of a blank screen'}
                  </Label>
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-lg border border-border bg-secondary/40 flex items-center justify-center overflow-hidden">
                      {draft.loadingGifDataUrl ? (
                        <img src={draft.loadingGifDataUrl} alt="Loading" className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-xs text-muted-foreground">{language === 'ar' ? 'لا يوجد' : 'None'}</span>
                      )}
                    </div>
                    <Button type="button" variant="secondary" onClick={() => loadingGifRef.current?.click()}>
                      {language === 'ar' ? 'تحميل' : 'Upload'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDraft((d) => ({ ...d, loadingGifDataUrl: undefined }))}
                      disabled={!draft.loadingGifDataUrl}
                    >
                      {language === 'ar' ? 'إزالة' : 'Remove'}
                    </Button>
                    <input ref={loadingGifRef} type="file" accept="image/*" className="hidden" onChange={onPickLoadingGif} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {language === 'ar'
                      ? `الحد الأقصى ${MAX_IMG_MB}MB. يفضّل GIF صغير.`
                      : `Max ${MAX_IMG_MB}MB. Small GIF recommended.`}
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      {language === 'ar' ? 'لون العناوين' : 'Title color'}
                    </Label>
                    <Input
                      type="color"
                      value={draft.titleColor}
                      onChange={(e) => setDraft((d) => ({ ...d, titleColor: e.target.value }))}
                      className="h-10 p-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      {language === 'ar' ? 'لون النص' : 'Text color'}
                    </Label>
                    <Input
                      type="color"
                      value={draft.bodyColor}
                      onChange={(e) => setDraft((d) => ({ ...d, bodyColor: e.target.value }))}
                      className="h-10 p-1"
                    />
                  </div>
                </div>
              </div>

<div className="grid gap-3">
                <Label>{language === 'ar' ? 'الخلفية' : 'Background'}</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={draft.backgroundType === 'gradient' ? 'default' : 'outline'}
                    onClick={() => setDraft((d) => ({ ...d, backgroundType: 'gradient' }))}
                  >
                    {language === 'ar' ? 'تدرج' : 'Gradient'}
                  </Button>
                  <Button
                    type="button"
                    variant={draft.backgroundType === 'solid' ? 'default' : 'outline'}
                    onClick={() => setDraft((d) => ({ ...d, backgroundType: 'solid' }))}
                  >
                    {language === 'ar' ? 'لون' : 'Solid'}
                  </Button>
                  <Button
                    type="button"
                    variant={draft.backgroundType === 'image' ? 'default' : 'outline'}
                    onClick={() => bgRef.current?.click()}
                    className="gap-2"
                  >
                    <ImageIcon className="h-4 w-4" />
                    {language === 'ar' ? 'صورة' : 'Image'}
                  </Button>
                  <input ref={bgRef} type="file" accept="image/*" className="hidden" onChange={onPickBg} />
                </div>

                {draft.backgroundType === 'solid' && (
                  <div className="flex items-center gap-3">
                    <Label className="text-xs text-muted-foreground">{language === 'ar' ? 'لون الخلفية' : 'Background color'}</Label>
                    <Input type="color" value={draft.backgroundColor} onChange={(e) => setDraft((d) => ({ ...d, backgroundColor: e.target.value }))} className="h-10 w-20 p-1" />
                  </div>
                )}

                {draft.backgroundType === 'gradient' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex items-center gap-3">
                      <Label className="text-xs text-muted-foreground">{language === 'ar' ? 'من' : 'From'}</Label>
                      <Input type="color" value={draft.gradientFrom} onChange={(e) => setDraft((d) => ({ ...d, gradientFrom: e.target.value }))} className="h-10 w-20 p-1" />
                    </div>
                    <div className="flex items-center gap-3">
                      <Label className="text-xs text-muted-foreground">{language === 'ar' ? 'إلى' : 'To'}</Label>
                      <Input type="color" value={draft.gradientTo} onChange={(e) => setDraft((d) => ({ ...d, gradientTo: e.target.value }))} className="h-10 w-20 p-1" />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-3">
                  <Label className="text-xs text-muted-foreground">{language === 'ar' ? 'اللون الرئيسي' : 'Primary color'}</Label>
                  <Input type="color" value={draft.primaryColor} onChange={(e) => setDraft((d) => ({ ...d, primaryColor: e.target.value }))} className="h-10 w-20 p-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{language === 'ar' ? 'شفافية البطاقة' : 'Card opacity'}</Label>
                  <Input
                    type="number"
                    min={0.6}
                    max={1}
                    step={0.02}
                    value={draft.cardOpacity}
                    onChange={(e) => setDraft((d) => ({ ...d, cardOpacity: Number(e.target.value || 0.92) }))}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>{language === 'ar' ? 'خط إنجليزي' : 'English font'}</Label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={draft.fontEn}
                    onChange={(e) => setDraft((d) => ({ ...d, fontEn: e.target.value }))}
                  >
                    <option value="Inter">Inter</option>
                    <option value="Poppins">Poppins</option>
                    <option value="Nunito">Nunito</option>
                  </select>
                </div>
                <div>
                  <Label>{language === 'ar' ? 'خط عربي' : 'Arabic font'}</Label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={draft.fontAr}
                    onChange={(e) => setDraft((d) => ({ ...d, fontAr: e.target.value }))}
                  >
                    <option value="Cairo">Cairo</option>
                    <option value="Tajawal">Tajawal</option>
                    <option value="Noto Kufi Arabic">Noto Kufi Arabic</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs text-muted-foreground">{language === 'ar' ? 'حجم العنوان' : 'Title size'}</Label>
                  <Input type="number" min={18} max={40} value={draft.titleSizePx} onChange={(e) => setDraft((d) => ({ ...d, titleSizePx: Number(e.target.value || 26) }))} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{language === 'ar' ? 'حجم النص' : 'Body size'}</Label>
                  <Input type="number" min={12} max={18} value={draft.bodySizePx} onChange={(e) => setDraft((d) => ({ ...d, bodySizePx: Number(e.target.value || 14) }))} />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={onSave} className="gap-2" disabled={saving}>
                  <Save className="h-4 w-4" />
                  {saving
                    ? language === 'ar'
                      ? 'جاري الحفظ...'
                      : 'Saving...'
                    : language === 'ar'
                      ? 'حفظ وتطبيق'
                      : 'Save & Apply'}
                </Button>
                <Button type="button" variant="outline" onClick={onReset} className="gap-2" disabled={saving}>
                  <RotateCcw className="h-4 w-4" />
                  {language === 'ar' ? 'إعادة ضبط' : 'Reset'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => navigate('/settings')} className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  {language === 'ar' ? 'رجوع' : 'Back'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Live Preview */}
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Paintbrush className="h-4 w-4" />
                {language === 'ar' ? 'معاينة' : 'Preview'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl overflow-hidden border" style={previewStyle}>
                <div className="min-h-[520px] flex items-center justify-center p-6">
                  <div
                    className="w-full max-w-md rounded-2xl border border-white/10 shadow-2xl backdrop-blur-md"
                    style={{ backgroundColor: `rgba(255,255,255,${draft.cardOpacity})` }}
                  >
                    <div className="p-6 text-center">
                      {draft.logoDataUrl && (
                        <div className="flex justify-center mb-4">
                          <img src={draft.logoDataUrl} alt="logo" style={{ width: `${draft.logoWidthPx}px` }} className="object-contain" />
                        </div>
                      )}
                      <h2
                        className="font-bold"
                        style={{ fontSize: `${draft.titleSizePx}px`, fontFamily: language === 'ar' ? draft.fontAr : draft.fontEn, color: draft.titleColor }}
                      >
                        {language === 'ar' ? draft.appNameAr : draft.appNameEn}
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground" style={{ fontSize: `${draft.bodySizePx}px`, color: draft.bodyColor }}>
                        {language === 'ar' ? 'مثال على شاشة الدخول' : 'Example login screen'}
                      </p>
                      <div className="mt-6 grid gap-3 text-left">
                        <div className="h-10 rounded-md bg-white/70 border" />
                        <div className="h-10 rounded-md bg-white/70 border" />
                        <div
                          className="h-10 rounded-md text-white flex items-center justify-center font-medium"
                          style={{ backgroundColor: draft.primaryColor }}
                        >
                          {language === 'ar' ? 'تسجيل الدخول' : 'Login'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default BrandingSettingsPage;