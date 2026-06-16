import React from 'react';
import { Button } from '@/components/ui/button';

const ConfigErrorPage: React.FC = () => {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6">
      <div className="max-w-xl w-full rounded-2xl border bg-background p-6 shadow-sm">
        <h1 className="text-xl font-semibold mb-2">Configuration required</h1>
        <p className="text-sm text-muted-foreground mb-4">
          The app can’t find Supabase environment variables. This usually happens after deployment
          when the hosting platform (Vercel/Netlify/etc.) doesn’t have the same .env values.
        </p>

        <div className="text-sm rounded-xl bg-muted p-4 font-mono whitespace-pre-wrap mb-4">
{`Required variables:
- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY

Optional (if your project uses it):
- VITE_SUPABASE_PROJECT_ID`}
        </div>

        <div className="flex gap-2 flex-col sm:flex-row">
          <Button onClick={() => window.location.reload()} className="w-full sm:w-auto">
            Reload
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard?.writeText(
                'VITE_SUPABASE_URL=\nVITE_SUPABASE_PUBLISHABLE_KEY=\nVITE_SUPABASE_PROJECT_ID='
              );
            }}
            className="w-full sm:w-auto"
          >
            Copy template
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mt-4">
          After setting the variables in your hosting platform, redeploy the site.
        </p>
      </div>
    </div>
  );
};

export default ConfigErrorPage;
