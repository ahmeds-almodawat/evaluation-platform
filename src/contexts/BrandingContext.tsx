import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { pageKeyFromPath, type BrandingPageKey } from '@/lib/pageBranding';

/**
 * NOTE:
 * - Keep this type intentionally "loose" (optional fields) to remain compatible with older UI code.
 * - In runtime, we always normalize it to a complete object with defaults (no undefined crashes).
 */
export type Branding = {
  appNameEn?: string;
  appNameAr?: string;

  // Assets: prefer PUBLIC URLs (storage public URLs). Can temporarily be data:... before upload.
  logoDataUrl?: string | null;
  headerIconDataUrl?: string | null;
  faviconDataUrl?: string | null;
  loaderGifDataUrl?: string | null; // legacy name
  loadingGifDataUrl?: string | null; // some code may use this name
  backgroundImageDataUrl?: string | null;

  // Sizes / typography
  logoWidthPx?: number;
  headerIconWidthPx?: number;
  titleSizePx?: number;
  bodySizePx?: number;
  fontEn?: string;
  fontAr?: string;

  // Colors / layout
  titleColor?: string;
  bodyColor?: string;
  primaryColor?: string;
  cardOpacity?: number;

  backgroundType?: 'gradient' | 'solid' | 'image';
  backgroundColor?: string;
  gradientFrom?: string;
  gradientTo?: string;
};

type BrandingContextType = {
  /** What most pages should use (global + page override merged) */
  branding: Branding;

  /** Backward compatible: old code used these names */
  pageBranding: Partial<Record<BrandingPageKey, Branding>>;
  setBrandingPages: (next: Partial<Record<BrandingPageKey, Branding>>) => Promise<void>;

  /** Newer, clearer names */
  globalBranding: Branding;
  pageOverrides: Partial<Record<BrandingPageKey, Branding>>;
  pageKey: BrandingPageKey;

  /** Loading flags */
  isLoaded: boolean;
  isLoading: boolean;

  /** Persistence */
  refreshFromDb: () => Promise<void>;
  setBranding: (next: Partial<Branding> | Branding) => Promise<void>;
  setPageOverride: (k: BrandingPageKey, next: Partial<Branding>) => Promise<void>;
  /** Backward compatible helper used by older settings UI */
  getPageOverride: (k: BrandingPageKey) => Branding;
  resetBranding: () => Promise<void>;
  resetPageOverride: (k: BrandingPageKey) => Promise<void>;

  /** Storage helper */
  uploadDataUrlToBrandingBucket: (dataUrl: string, filenameHint?: string) => Promise<string>;
};

const BrandingContext = createContext<BrandingContextType | null>(null);

const LS_BRANDING_KEY = 'almodawat_branding_v1';
const LS_PAGES_KEY = 'almodawat_branding_pages_v1';

const DEFAULT_BRANDING: Branding = {
  appNameEn: 'Almodawat Employee Portal',
  appNameAr: 'بوابة موظفي المداواة',

  logoDataUrl: null,
  headerIconDataUrl: null,
  faviconDataUrl: null,
  loaderGifDataUrl: null,
  loadingGifDataUrl: null,
  backgroundImageDataUrl: null,

  logoWidthPx: 300,
  headerIconWidthPx: 28,
  titleSizePx: 26,
  bodySizePx: 14,

  titleColor: '#e2e8f0',
  bodyColor: '#cbd5e1',
  primaryColor: '#2563eb',
  cardOpacity: 0.92,

  backgroundType: 'gradient',
  backgroundColor: '#0b1220',
  gradientFrom: '#0b1220',
  gradientTo: '#1f2937',

  fontEn: 'Inter',
  fontAr: 'Cairo',
};

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isDataUrl(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('data:');
}

function pickString(obj: any, ...keys: string[]) {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === 'string' && v.trim().length > 0) return v;
  }
  return null;
}

/**
 * Accept BOTH camelCase and snake_case keys (because you sometimes edited DB manually).
 * Always returns a fully-populated Branding object (no undefined crashes).
 */
function normalizeBranding(input: any): Branding {
  const b = typeof input === 'object' && input ? { ...input } : {};

  const normalized: Branding = {
    ...DEFAULT_BRANDING,
    ...b,

    // Assets (support many naming variants)
    logoDataUrl: pickString(b, 'logoDataUrl', 'logo_url', 'logoUrl', 'logodataurl') ?? DEFAULT_BRANDING.logoDataUrl,
    headerIconDataUrl:
      pickString(b, 'headerIconDataUrl', 'header_icon_url', 'headerIconUrl', 'headericondataurl') ?? DEFAULT_BRANDING.headerIconDataUrl,
    faviconDataUrl: pickString(b, 'faviconDataUrl', 'favicon_url', 'faviconUrl') ?? DEFAULT_BRANDING.faviconDataUrl,
    loaderGifDataUrl:
      pickString(b, 'loaderGifDataUrl', 'loadingGifDataUrl', 'loader_gif_url', 'loading_gif_url') ?? DEFAULT_BRANDING.loaderGifDataUrl,
    loadingGifDataUrl:
      pickString(b, 'loadingGifDataUrl', 'loaderGifDataUrl', 'loading_gif_url', 'loader_gif_url') ?? DEFAULT_BRANDING.loadingGifDataUrl,
    backgroundImageDataUrl:
      pickString(b, 'backgroundImageDataUrl', 'background_image_url', 'backgroundImageUrl') ?? DEFAULT_BRANDING.backgroundImageDataUrl,
  };

  // Safety defaults
  if (!normalized.backgroundType) normalized.backgroundType = 'gradient';
  if (!normalized.logoWidthPx) normalized.logoWidthPx = DEFAULT_BRANDING.logoWidthPx;
  if (!normalized.headerIconWidthPx) normalized.headerIconWidthPx = DEFAULT_BRANDING.headerIconWidthPx;
  if (!normalized.titleSizePx) normalized.titleSizePx = DEFAULT_BRANDING.titleSizePx;
  if (!normalized.bodySizePx) normalized.bodySizePx = DEFAULT_BRANDING.bodySizePx;

  return normalized;
}

function applyBrandCssVars(brandingInput: any) {
  const branding = normalizeBranding(brandingInput);

  const root = document.documentElement;
  root.style.setProperty('--brand-primary', branding.primaryColor || DEFAULT_BRANDING.primaryColor!);
  root.style.setProperty('--brand-primary-color', branding.primaryColor || DEFAULT_BRANDING.primaryColor!);
  root.style.setProperty('--brand-title', branding.titleColor || DEFAULT_BRANDING.titleColor!);
  root.style.setProperty('--brand-title-color', branding.titleColor || DEFAULT_BRANDING.titleColor!);
  root.style.setProperty('--brand-body', branding.bodyColor || DEFAULT_BRANDING.bodyColor!);
  root.style.setProperty('--brand-body-color', branding.bodyColor || DEFAULT_BRANDING.bodyColor!);
  root.style.setProperty('--brand-card-opacity', String(branding.cardOpacity ?? DEFAULT_BRANDING.cardOpacity));

  root.style.setProperty('--brand-bg-type', branding.backgroundType || 'gradient');
  root.style.setProperty('--brand-bg', branding.backgroundColor || DEFAULT_BRANDING.backgroundColor!);
  root.style.setProperty('--brand-grad-from', branding.gradientFrom || DEFAULT_BRANDING.gradientFrom!);
  root.style.setProperty('--brand-grad-to', branding.gradientTo || DEFAULT_BRANDING.gradientTo!);

  if (branding.backgroundType === 'image' && branding.backgroundImageDataUrl) {
    root.style.setProperty('--brand-bg-image', `url("${branding.backgroundImageDataUrl}")`);
  } else {
    root.style.setProperty('--brand-bg-image', 'none');
  }
}

function applyFaviconAndTitle(brandingInput: any) {
  const branding = normalizeBranding(brandingInput);

  // Title (use EN name as stable default)
  if (typeof document !== 'undefined') {
    const title = branding.appNameEn || branding.appNameAr || DEFAULT_BRANDING.appNameEn!;
    if (title && document.title !== title) document.title = title;
  }

  // Favicon
  const url = branding.faviconDataUrl;
  if (!url || typeof document === 'undefined') return;

  const ensureLink = (rel: string) => {
    let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
    if (!el) {
      el = document.createElement('link');
      el.rel = rel;
      document.head.appendChild(el);
    }
    return el;
  };

  try {
    const icon = ensureLink('icon');
    icon.href = url;
    const shortcut = ensureLink('shortcut icon');
    shortcut.href = url;
    const apple = ensureLink('apple-touch-icon');
    apple.href = url;
  } catch {
    // no-op
  }
}

async function dataUrlToBlob(dataUrl: string): Promise<{ blob: Blob; contentType: string }> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const contentType = res.headers.get('content-type') || blob.type || 'application/octet-stream';
  return { blob, contentType };
}

function safeName(name: string) {
  return name.replace(/[^\w.\-() ]+/g, '_');
}

function randomId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  // Fast paint from local cache
  const [globalBranding, setGlobalBranding] = useState<Branding>(() => {
    const stored = safeParseJson<any>(localStorage.getItem(LS_BRANDING_KEY));
    return normalizeBranding(stored ?? DEFAULT_BRANDING);
  });

  const [pageOverrides, setPageOverrides] = useState<Partial<Record<BrandingPageKey, Branding>>>(() => {
    return safeParseJson<Partial<Record<BrandingPageKey, Branding>>>(localStorage.getItem(LS_PAGES_KEY)) ?? {};
  });

  const [pageKey, setPageKey] = useState<BrandingPageKey>(() => pageKeyFromPath(window.location.pathname));
  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const didLoadRef = useRef(false);

  useEffect(() => {
    const onPop = () => setPageKey(pageKeyFromPath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const branding = useMemo(() => {
    const override = pageOverrides?.[pageKey] ?? {};
    return normalizeBranding({ ...globalBranding, ...override });
  }, [globalBranding, pageOverrides, pageKey]);

  // Apply CSS vars safely (prevents "backgroundType" crash)
  useEffect(() => {
    applyBrandCssVars(branding);
    applyFaviconAndTitle(branding);
  }, [branding]);

  // Cache (still helpful), but DB is source of truth
  useEffect(() => {
    localStorage.setItem(LS_BRANDING_KEY, JSON.stringify(globalBranding));
  }, [globalBranding]);

  useEffect(() => {
    localStorage.setItem(LS_PAGES_KEY, JSON.stringify(pageOverrides));
  }, [pageOverrides]);

  async function uploadDataUrlToBrandingBucket(dataUrl: string, filenameHint?: string) {
    const { blob, contentType } = await dataUrlToBlob(dataUrl);

    const ext = contentType.includes('png')
      ? 'png'
      : contentType.includes('jpeg')
        ? 'jpg'
        : contentType.includes('gif')
          ? 'gif'
          : 'bin';

    const filename = safeName(filenameHint || `branding_${randomId()}.${ext}`);

    const { error } = await supabase.storage.from('branding').upload(filename, blob, {
      contentType,
      upsert: true,
    });
    if (error) throw error;

    const { data } = supabase.storage.from('branding').getPublicUrl(filename);
    return data.publicUrl;
  }

  async function persistToDb(nextGlobal: Branding, nextPages: Partial<Record<BrandingPageKey, Branding>>) {
    if (!isSupabaseConfigured) return;

    // Convert any base64 data urls into public URLs
    const g = normalizeBranding(nextGlobal);

    if (g.logoDataUrl && isDataUrl(g.logoDataUrl)) g.logoDataUrl = await uploadDataUrlToBrandingBucket(g.logoDataUrl, 'logo.png');
    if (g.headerIconDataUrl && isDataUrl(g.headerIconDataUrl)) g.headerIconDataUrl = await uploadDataUrlToBrandingBucket(g.headerIconDataUrl, 'header_icon.png');
    if (g.faviconDataUrl && isDataUrl(g.faviconDataUrl)) g.faviconDataUrl = await uploadDataUrlToBrandingBucket(g.faviconDataUrl, 'favicon.png');
    const gif = (g.loadingGifDataUrl ?? g.loaderGifDataUrl) ?? null;
    if (gif && isDataUrl(gif)) {
      const url = await uploadDataUrlToBrandingBucket(gif, 'loading.gif');
      g.loadingGifDataUrl = url;
      g.loaderGifDataUrl = url;
    }
    if (g.backgroundImageDataUrl && isDataUrl(g.backgroundImageDataUrl)) g.backgroundImageDataUrl = await uploadDataUrlToBrandingBucket(g.backgroundImageDataUrl, 'background.png');

    const pages: Partial<Record<BrandingPageKey, Branding>> = { ...(nextPages ?? {}) };
    for (const k of Object.keys(pages) as BrandingPageKey[]) {
      const p = normalizeBranding(pages[k]);
      if (p.logoDataUrl && isDataUrl(p.logoDataUrl)) p.logoDataUrl = await uploadDataUrlToBrandingBucket(p.logoDataUrl, `${k}_logo.png`);
      if (p.headerIconDataUrl && isDataUrl(p.headerIconDataUrl)) p.headerIconDataUrl = await uploadDataUrlToBrandingBucket(p.headerIconDataUrl, `${k}_header_icon.png`);
      if (p.faviconDataUrl && isDataUrl(p.faviconDataUrl)) p.faviconDataUrl = await uploadDataUrlToBrandingBucket(p.faviconDataUrl, `${k}_favicon.png`);
      const pgif = (p.loadingGifDataUrl ?? p.loaderGifDataUrl) ?? null;
      if (pgif && isDataUrl(pgif)) {
        const url = await uploadDataUrlToBrandingBucket(pgif, `${k}_loading.gif`);
        p.loadingGifDataUrl = url;
        p.loaderGifDataUrl = url;
      }
      if (p.backgroundImageDataUrl && isDataUrl(p.backgroundImageDataUrl)) p.backgroundImageDataUrl = await uploadDataUrlToBrandingBucket(p.backgroundImageDataUrl, `${k}_background.png`);
      pages[k] = p;
    }

    // Store both camel and snake aliases (so any part of app/manual SQL still works)
    const brandingForDb = {
      ...g,
      logo_url: g.logoDataUrl ?? null,
      header_icon_url: g.headerIconDataUrl ?? null,
      favicon_url: g.faviconDataUrl ?? null,
      loading_gif_url: g.loadingGifDataUrl ?? g.loaderGifDataUrl ?? null,
      background_image_url: g.backgroundImageDataUrl ?? null,
    };

    const { error } = await supabase
      .from('branding_settings' as any)
      .upsert(
        {
          id: 1,
          branding: brandingForDb,
          page_overrides: pages,
          updated_at: new Date().toISOString(),
        } as any,
        { onConflict: 'id' }
      );

    if (error) throw error;

    // Cache what we saved
    localStorage.setItem(LS_BRANDING_KEY, JSON.stringify(brandingForDb));
    localStorage.setItem(LS_PAGES_KEY, JSON.stringify(pages));
  }

  async function refreshFromDb() {
    if (!isSupabaseConfigured) {
      setIsLoaded(true);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('branding_settings' as any)
        .select('branding, page_overrides')
        .eq('id', 1)
        .maybeSingle();

      if (error) throw error;

      const nextGlobal = normalizeBranding(data?.branding ?? DEFAULT_BRANDING);
      const nextPages = (data?.page_overrides ?? {}) as Partial<Record<BrandingPageKey, Branding>>;

      setGlobalBranding(nextGlobal);
      setPageOverrides(nextPages);

      localStorage.setItem(LS_BRANDING_KEY, JSON.stringify(data?.branding ?? nextGlobal));
      localStorage.setItem(LS_PAGES_KEY, JSON.stringify(nextPages));
    } catch (e) {
      console.warn('[Branding] Failed to load branding_settings:', e);
    } finally {
      setIsLoading(false);
      setIsLoaded(true);
    }
  }

  // Initial DB load (this is what makes private window / other devices see the logo)
  useEffect(() => {
    if (didLoadRef.current) return;
    didLoadRef.current = true;
    refreshFromDb();
  }, []);

  async function setBranding(next: Partial<Branding> | Branding) {
    const merged = normalizeBranding({ ...globalBranding, ...(next ?? {}) });
    setGlobalBranding(merged);
    await persistToDb(merged, pageOverrides);
  }

  async function setBrandingPages(next: Partial<Record<BrandingPageKey, Branding>>) {
    const merged = { ...(next ?? {}) };
    setPageOverrides(merged);
    await persistToDb(globalBranding, merged);
  }

  async function setPageOverride(k: BrandingPageKey, next: Partial<Branding>) {
    const current = pageOverrides?.[k] ?? {};
    const mergedPage = normalizeBranding({ ...current, ...(next ?? {}) });
    const nextPages = { ...pageOverrides, [k]: mergedPage };
    setPageOverrides(nextPages);
    await persistToDb(globalBranding, nextPages);
  }

  // Backward compatible helper for older UI code
  function getPageOverride(k: BrandingPageKey): Branding {
    return normalizeBranding(pageOverrides?.[k] ?? {});
  }

  async function resetBranding() {
    setGlobalBranding(DEFAULT_BRANDING);
    await persistToDb(DEFAULT_BRANDING, pageOverrides);
  }

  async function resetPageOverride(k: BrandingPageKey) {
    const nextPages = { ...pageOverrides };
    delete nextPages[k];
    setPageOverrides(nextPages);
    await persistToDb(globalBranding, nextPages);
  }

  const value: BrandingContextType = {
    branding,

    // Backward compatible aliases
    pageBranding: pageOverrides,
    setBrandingPages,

    // Newer names
    globalBranding,
    pageOverrides,
    pageKey,

    // Loading flags
    isLoaded,
    isLoading,

    // Persistence
    refreshFromDb,
    setBranding,
    setPageOverride,
    getPageOverride,
    resetBranding,
    resetPageOverride,

    // Storage helper
    uploadDataUrlToBrandingBucket,
  };

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): BrandingContextType {
  const ctx = useContext(BrandingContext);

  // Fallback so app never whitescreens even if provider isn't mounted (shouldn't happen, but safe)
  if (!ctx) {
    const pageKey = pageKeyFromPath(typeof window !== 'undefined' ? window.location.pathname : '/');
    return {
      branding: DEFAULT_BRANDING,
      pageBranding: {},
      setBrandingPages: async () => {},
      globalBranding: DEFAULT_BRANDING,
      pageOverrides: {},
      pageKey,
      isLoaded: true,
      isLoading: false,
      refreshFromDb: async () => {},
      setBranding: async () => {},
      setPageOverride: async () => {},
      getPageOverride: () => DEFAULT_BRANDING,
      resetBranding: async () => {},
      resetPageOverride: async () => {},
      uploadDataUrlToBrandingBucket: async () => '',
    };
  }

  /**
   * IMPORTANT:
   * The provider already normalizes `branding` and `globalBranding`.
   * Re-normalizing here creates a new object on every render, which breaks
   * referential equality and can trigger infinite render loops in pages that
   * `useEffect` on `branding` (e.g., BrandingSettingsPage).
   */
  return ctx;
}
