import React, { useEffect, useMemo, useState } from "react";
import Header from "@/components/layout/Header";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";

type AuditEventRow = {
  id: string;
  created_at: string;
  actor_user_id: string;
  event_type: string;
  target_user_id: string | null;
  period: string | null;
  evaluation_id: string | null;
  metadata: any;
};

const PAGE_SIZE = 50;

export default function SensitiveAccessLogsPage() {
  const { language } = useLanguage();
  const { hasPermission } = useSupabaseAuth();
  const isAr = language === "ar";

  const canRead = hasPermission("audit.read");

  const [q, setQ] = useState("");
  const [eventType, setEventType] = useState<string>("EVAL_IDENTITY_REVEAL");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AuditEventRow[]>([]);

  const eventOptions = useMemo(
    () => [
      { key: "EVAL_IDENTITY_REVEAL", label: isAr ? "كشف هوية المقيم" : "Evaluation identity reveal" },
      { key: "all", label: isAr ? "الكل" : "All" },
    ],
    [isAr]
  );

  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(isAr ? "ar" : "en");
    } catch {
      return iso;
    }
  };

  async function load() {
    if (!canRead) return;
    setLoading(true);
    try {
      let query = supabase
        .from("audit_events")
        .select("*")
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (eventType && eventType !== "all") query = query.eq("event_type", eventType);
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", to);

      // simple search across ids/period (client-side filter for now)
      const { data, error } = await query;
      if (error) throw error;

      const raw = (data ?? []) as AuditEventRow[];
      const needle = q.trim().toLowerCase();
      const filtered = needle
        ? raw.filter((r) =>
            [r.actor_user_id, r.target_user_id ?? "", r.period ?? "", r.evaluation_id ?? "", r.event_type]
              .join(" ")
              .toLowerCase()
              .includes(needle)
          )
        : raw;

      setRows(filtered);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load sensitive access logs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, eventType]);

  if (!canRead) {
    return (
      <div className="min-h-screen bg-background">
        <Header title={isAr ? "سجل الوصول الحساس" : "Sensitive Access Logs"} />
        <div className="p-6">
          <Card>
            <CardHeader>
              <CardTitle>{isAr ? "غير مصرح" : "Not authorized"}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {isAr ? "لا تملك صلاحية عرض سجل التدقيق." : "You do not have permission to view audit logs."}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header
        title={isAr ? "سجل الوصول الحساس" : "Sensitive Access Logs"}
        subtitle={isAr ? "أي كشف لهوية المقيم يتم تسجيله هنا." : "Any rater identity reveal is recorded here."}
      />

      <div className="p-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              {isAr ? "فلاتر" : "Filters"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
              <div>
                <div className="text-sm text-muted-foreground mb-1">{isAr ? "نوع الحدث" : "Event type"}</div>
                <Select value={eventType} onValueChange={(v) => { setEventType(v); setPage(0); }}>
                  <SelectTrigger>
                    <SelectValue placeholder={isAr ? "اختر" : "Select"} />
                  </SelectTrigger>
                  <SelectContent>
                    {eventOptions.map((o) => (
                      <SelectItem key={o.key} value={o.key}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">{isAr ? "بحث" : "Search"}</div>
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={isAr ? "ID / period" : "ID / period"} />
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">{isAr ? "من" : "From"}</div>
                <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="YYYY-MM-DD" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">{isAr ? "إلى" : "To"}</div>
                <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="YYYY-MM-DD" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={() => { setPage(0); load(); }} disabled={loading}>
                {isAr ? "تطبيق" : "Apply"}
              </Button>
              <Button variant="secondary" onClick={() => { setQ(""); setFrom(""); setTo(""); setEventType("EVAL_IDENTITY_REVEAL"); setPage(0); }} disabled={loading}>
                {isAr ? "إعادة ضبط" : "Reset"}
              </Button>
              <div className="flex-1" />
              <Button variant="outline" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={loading || page === 0}>
                {isAr ? "السابق" : "Prev"}
              </Button>
              <Button variant="outline" onClick={() => setPage((p) => p + 1)} disabled={loading || rows.length < PAGE_SIZE}>
                {isAr ? "التالي" : "Next"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{isAr ? "السجل" : "Log"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">{isAr ? "الوقت" : "Time"}</th>
                    <th className="text-left py-2 px-2">{isAr ? "الحدث" : "Event"}</th>
                    <th className="text-left py-2 px-2">{isAr ? "المستخدم" : "Actor"}</th>
                    <th className="text-left py-2 px-2">{isAr ? "المستهدف" : "Target"}</th>
                    <th className="text-left py-2 px-2">{isAr ? "الفترة" : "Period"}</th>
                    <th className="text-left py-2 px-2">{isAr ? "بيانات" : "Metadata"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-b-0">
                      <td className="py-2 px-2 whitespace-nowrap">{fmt(r.created_at)}</td>
                      <td className="py-2 px-2">{r.event_type}</td>
                      <td className="py-2 px-2 font-mono text-xs">{r.actor_user_id}</td>
                      <td className="py-2 px-2 font-mono text-xs">{r.target_user_id ?? "—"}</td>
                      <td className="py-2 px-2">{r.period ?? "—"}</td>
                      <td className="py-2 px-2">
                        <pre className="max-w-[560px] whitespace-pre-wrap break-words text-xs text-muted-foreground">
                          {r.metadata ? JSON.stringify(r.metadata, null, 2) : "—"}
                        </pre>
                      </td>
                    </tr>
                  ))}

                  {!loading && rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-muted-foreground">
                        {isAr ? "لا توجد نتائج" : "No results"}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
