import React, { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiV1Json } from '@/lib/apiV1';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import EmptyState from '@/components/common/EmptyState';

type AuditRow = {
  id?: string;
  created_at?: string;
  actor_user_id?: string | null;
  actor_email?: string | null;
  action?: string;
  success?: boolean;
  entity_type?: string | null;
  entity_id?: string | null;
  request_id?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  metadata?: any;
};

type AuditResponse = {
  rows: AuditRow[];
  total: number;
  limit: number;
  offset: number;
  requestId: string;
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const AuditLogsPage: React.FC = () => {
  const { language } = useLanguage();

  const [action, setAction] = useState<string>('all');
  const [q, setQ] = useState<string>('');
  const [from, setFrom] = useState<string>(''); // ISO date or datetime
  const [to, setTo] = useState<string>('');
  const [page, setPage] = useState<number>(0);

  const limit = 50;
  const offset = page * limit;

  const actionOptions = useMemo(
    () => [
      'all',
      'EXPORT_REPORT_PDF',
      'EXPORT_REPORT_XLSX',
      'EXPORT_PDF',
      'EXPORT_EXCEL',
      'EXPORT_USERS_CSV',
      'EXPORT_USERS_CSV_DENIED',
      'EXPORT_USERS_CSV_FAILED',
      'AUDIT_PING',
      'AUTH_LOGIN',
      'AUTH_LOGOUT',
      'EVALUATION_CREATE',
      'EVALUATION_UPDATE',
      'EVALUATION_DELETE',
      'USER_CREATE',
      'USER_UPDATE',
      'USER_DELETE',
    ],
    [],
  );

  const query = useQuery({
    queryKey: ['audit-logs', action, q, from, to, offset],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      if (action && action !== 'all') params.set('action', action);
      if (q.trim()) params.set('q', q.trim());
      if (from) params.set('from', from);
      if (to) params.set('to', to);

      return await apiV1Json<AuditResponse>(`/api/v1/audit/logs?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
  });

  const totalPages = query.data ? Math.max(1, Math.ceil((query.data.total || 0) / limit)) : 1;
  const safePage = clamp(page, 0, totalPages - 1);

  const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString(language === 'ar' ? 'ar' : 'en');
    } catch {
      return iso;
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{language === 'ar' ? 'سجل التدقيق' : 'Audit Logs'}</h1>
        <p className="text-muted-foreground">
          {language === 'ar'
            ? 'عرض عمليات التصدير والتغييرات الحساسة (مقيد بصلاحيات التدقيق).'
            : 'View exports and sensitive changes (restricted to audit roles).'}
        </p>
      </div>

      <div className="bg-card border rounded-xl p-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          <div>
            <div className="text-sm text-muted-foreground mb-1">{language === 'ar' ? 'الإجراء' : 'Action'}</div>
            <Select value={action} onValueChange={(v) => { setAction(v); setPage(0); }}>
              <SelectTrigger>
                <SelectValue placeholder={language === 'ar' ? 'اختر...' : 'Select...'} />
              </SelectTrigger>
              <SelectContent>
                {actionOptions.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="text-sm text-muted-foreground mb-1">{language === 'ar' ? 'بحث' : 'Search'}</div>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={language === 'ar' ? 'email / action ...' : 'email / action ...'}
            />
          </div>

          <div>
            <div className="text-sm text-muted-foreground mb-1">{language === 'ar' ? 'من' : 'From'}</div>
            <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="YYYY-MM-DD" />
          </div>

          <div>
            <div className="text-sm text-muted-foreground mb-1">{language === 'ar' ? 'إلى' : 'To'}</div>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="YYYY-MM-DD" />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mt-4">
          <Button onClick={() => { setPage(0); query.refetch(); }} disabled={query.isFetching}>
            {language === 'ar' ? 'تطبيق' : 'Apply'}
          </Button>
          <Button variant="secondary" onClick={() => { setAction('all'); setQ(''); setFrom(''); setTo(''); setPage(0); }} disabled={query.isFetching}>
            {language === 'ar' ? 'مسح' : 'Reset'}
          </Button>
          <div className="flex-1" />
          <div className="text-sm text-muted-foreground self-center">
            {query.data ? `${query.data.total} ${language === 'ar' ? 'سجل' : 'records'}` : '—'}
          </div>
        </div>
      </div>

      {query.isError ? (
        <EmptyState
          title={language === 'ar' ? 'تعذر تحميل السجل' : 'Could not load logs'}
          description={language === 'ar' ? 'تحقق من الصلاحيات والاتصال.' : 'Check permissions and connection.'}
          actionLabel={language === 'ar' ? 'إعادة المحاولة' : 'Retry'}
          onAction={() => query.refetch()}
        />
      ) : (
        <div className="bg-card border rounded-xl p-4">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2">{language === 'ar' ? 'الوقت' : 'Time'}</th>
                  <th className="text-left py-2 px-2">{language === 'ar' ? 'الإجراء' : 'Action'}</th>
                  <th className="text-left py-2 px-2">{language === 'ar' ? 'المستخدم' : 'Actor'}</th>
                  <th className="text-left py-2 px-2">{language === 'ar' ? 'نجاح' : 'Success'}</th>
                  <th className="text-left py-2 px-2">{language === 'ar' ? 'الكيان' : 'Entity'}</th>
                  <th className="text-left py-2 px-2">{language === 'ar' ? 'Request ID' : 'Request ID'}</th>
                </tr>
              </thead>
              <tbody>
                {(query.data?.rows ?? []).map((r, idx) => (
                  <tr key={r.id ?? `${r.request_id}-${idx}`} className="border-b last:border-b-0">
                    <td className="py-2 px-2 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                    <td className="py-2 px-2">{r.action ?? '—'}</td>
                    <td className="py-2 px-2">{r.actor_email ?? r.actor_user_id ?? '—'}</td>
                    <td className="py-2 px-2">{r.success === false ? '✕' : '✓'}</td>
                    <td className="py-2 px-2">{r.entity_type ? `${r.entity_type}${r.entity_id ? `:${r.entity_id}` : ''}` : '—'}</td>
                    <td className="py-2 px-2 font-mono text-xs">{r.request_id ?? '—'}</td>
                  </tr>
                ))}

                {!query.isFetching && (query.data?.rows?.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-muted-foreground">
                      {language === 'ar' ? 'لا توجد نتائج' : 'No results'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 mt-4">
            <div className="text-sm text-muted-foreground">
              {language === 'ar'
                ? `صفحة ${safePage + 1} من ${totalPages}`
                : `Page ${safePage + 1} of ${totalPages}`}
            </div>

            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage <= 0 || query.isFetching}
              >
                {language === 'ar' ? 'السابق' : 'Prev'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setPage((p) => p + 1)}
                disabled={safePage >= totalPages - 1 || query.isFetching}
              >
                {language === 'ar' ? 'التالي' : 'Next'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLogsPage;
