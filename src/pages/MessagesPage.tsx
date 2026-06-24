import React, { useEffect, useMemo, useState } from 'react';
import Header from '@/components/layout/Header';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

type Dept = { id: string; name_en: string; name_ar: string };

type InboxRow = {
  message_id: string;
  delivered_at: string;
  read_at: string | null;
  messages: {
    id: string;
    message_type: 'broadcast' | 'to_admin';
    title: string;
    body: string;
    sender_id: string | null;
    sender_anonymous: boolean;
    created_at: string;
  };
};

const MessagesPage: React.FC = () => {
  const { language } = useLanguage();
  const { user, role } = useSupabaseAuth();
  const { toast } = useToast();

  const canBroadcast = role === 'admin' || role === 'super_user';
  const isAdmin = role === 'admin';

  // Compose: broadcast
  const [bTitle, setBTitle] = useState('');
  const [bBody, setBBody] = useState('');
  const [bMode, setBMode] = useState<'all' | 'filtered' | 'manual'>('all');
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [deptIds, setDeptIds] = useState<string[]>([]);
  const [roleFilters, setRoleFilters] = useState<Array<'admin' | 'super_user' | 'audit' | 'user'>>([]);
  const [manualUsers, setManualUsers] = useState<Array<{ id: string; label: string; department_id: string | null }>>([]);
  const [manualSelected, setManualSelected] = useState<string[]>([]);

  // Compose: to admin
  const [aTitle, setATitle] = useState('');
  const [aBody, setABody] = useState('');
  const [aAnon, setAAnon] = useState(false);

  // Inbox
  const [inbox, setInbox] = useState<InboxRow[]>([]);
  const [selected, setSelected] = useState<InboxRow | null>(null);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [sending, setSending] = useState(false);

  const title = language === 'ar' ? 'الرسائل' : 'Messages';
  const subtitle = language === 'ar' ? 'عرض الرسائل والإشعارات' : 'View messages and notifications';

  useEffect(() => {
    const loadDepts = async () => {
      const { data } = await supabase
        .from('departments')
        .select('id,name_en,name_ar')
        .order('name_en', { ascending: true });
      setDepartments((data as any) || []);
    };
    void loadDepts();
  }, []);

  useEffect(() => {
    const loadUsers = async () => {
      // Only needed for manual mode
      const { data, error } = await supabase
        .from('profiles')
        .select('id,name_en,name_ar,email,department_id')
        .eq('is_active', true)
        .order('name_en', { ascending: true })
        .limit(2000);
      if (error) return;
      setManualUsers(
        ((data as any) || []).map((p: any) => ({
          id: p.id,
          department_id: p.department_id ?? null,
          label: `${p.name_en || ''}${p.name_ar ? ` / ${p.name_ar}` : ''}${p.email ? ` (${p.email})` : ''}`.trim(),
        }))
      );
    };
    if (canBroadcast) void loadUsers();
  }, [canBroadcast]);

  const loadInbox = async () => {
    if (!user) return;
    setLoadingInbox(true);
    try {
      const { data, error } = await supabase
        .from('message_recipients')
        .select('message_id,delivered_at,read_at,messages:messages(id,message_type,title,body,sender_id,sender_anonymous,created_at)')
        .eq('recipient_id', user.id)
        .order('delivered_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setInbox((data as any) || []);
      if (!selected && (data as any)?.length) setSelected((data as any)[0]);
    } catch (e: any) {
      console.error(e);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: e?.message || (language === 'ar' ? 'فشل تحميل الرسائل' : 'Failed to load messages'),
        variant: 'destructive',
      });
    } finally {
      setLoadingInbox(false);
    }
  };

  useEffect(() => {
    void loadInbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const markRead = async (row: InboxRow) => {
    if (!user) return;
    if (row.read_at) return;
    const { error } = await supabase
      .from('message_recipients')
      .update({ read_at: new Date().toISOString() })
      .eq('message_id', row.message_id)
      .eq('recipient_id', user.id);
    if (!error) {
      setInbox(prev => prev.map(r => (r.message_id === row.message_id ? { ...r, read_at: new Date().toISOString() } : r)));
    }
  };

  const sendBroadcast = async () => {
    if (!canBroadcast) return;
    if (!bTitle.trim() || !bBody.trim()) {
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar' ? 'اكتب العنوان والمحتوى' : 'Please enter title and message',
        variant: 'destructive',
      });
      return;
    }
    setSending(true);
    try {
      const payload: any = {
        p_title: bTitle.trim(),
        p_body: bBody.trim(),
        p_department_ids: bMode === 'filtered' ? deptIds : null,
        p_roles: bMode === 'filtered' ? roleFilters : null,
        p_user_ids: bMode === 'manual' ? manualSelected : null,
      };
      const { error } = await supabase.rpc('send_broadcast_message', payload);
      if (error) throw error;
      toast({
        title: language === 'ar' ? 'تم الإرسال' : 'Sent',
        description: language === 'ar' ? 'تم إرسال الرسالة' : 'Message sent',
      });
      setBTitle('');
      setBBody('');
      setDeptIds([]);
      setRoleFilters([]);
      setManualSelected([]);
    } catch (e: any) {
      console.error(e);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: e?.message || (language === 'ar' ? 'فشل الإرسال' : 'Send failed'),
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const sendToAdmin = async () => {
    if (!aTitle.trim() || !aBody.trim()) {
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar' ? 'اكتب العنوان والمحتوى' : 'Please enter title and message',
        variant: 'destructive',
      });
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.rpc('send_message_to_admin', {
        p_title: aTitle.trim(),
        p_body: aBody.trim(),
        p_anonymous: aAnon,
      });
      if (error) throw error;
      toast({
        title: language === 'ar' ? 'تم الإرسال' : 'Sent',
        description: language === 'ar' ? 'تم إرسال الرسالة للإدارة' : 'Message sent to admin',
      });
      setATitle('');
      setABody('');
      setAAnon(false);
    } catch (e: any) {
      console.error(e);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: e?.message || (language === 'ar' ? 'فشل الإرسال' : 'Send failed'),
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const unreadCount = useMemo(() => inbox.filter(r => !r.read_at).length, [inbox]);

  return (
    <div className="flex flex-col h-full">
      <Header title={title} subtitle={subtitle} />
      <div className="p-6 space-y-6">
        <Tabs defaultValue="messages">
          <TabsList>
            <TabsTrigger value="messages">
              {language === 'ar' ? 'الرسائل' : 'Messages'}{unreadCount ? ` (${unreadCount})` : ''}
            </TabsTrigger>
            {isAdmin ? (
              <TabsTrigger value="notifications">{language === 'ar' ? 'الإشعارات' : 'Notifications'}</TabsTrigger>
            ) : null}
          </TabsList>

          <TabsContent value="messages">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-6">
                {canBroadcast ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>{language === 'ar' ? 'رسالة جديدة (للجميع/المجموعات)' : 'New Message (All / Groups)'}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>{language === 'ar' ? 'العنوان' : 'Title'}</Label>
                          <Input value={bTitle} onChange={e => setBTitle(e.target.value)} placeholder={language === 'ar' ? 'عنوان الرسالة' : 'Message title'} />
                        </div>
                        <div className="space-y-2">
                          <Label>{language === 'ar' ? 'نوع المستلمين' : 'Recipients'}</Label>
                          <Select value={bMode} onValueChange={(v: any) => setBMode(v)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">{language === 'ar' ? 'الكل' : 'All'}</SelectItem>
                              <SelectItem value="filtered">{language === 'ar' ? 'حسب القسم/الدور' : 'Filtered (Dept/Role)'}</SelectItem>
                              <SelectItem value="manual">{language === 'ar' ? 'يدوي' : 'Manual'}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {bMode === 'filtered' ? (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>{language === 'ar' ? 'الأقسام' : 'Departments'}</Label>
                            <div className="flex flex-wrap gap-2">
                              {departments.map(d => {
                                const checked = deptIds.includes(d.id);
                                return (
                                  <Button
                                    key={d.id}
                                    type="button"
                                    variant={checked ? 'default' : 'outline'}
                                    onClick={() => setDeptIds(prev => (checked ? prev.filter(x => x !== d.id) : [...prev, d.id]))}
                                  >
                                    {language === 'ar' ? d.name_ar : d.name_en}
                                  </Button>
                                );
                              })}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>{language === 'ar' ? 'الأدوار' : 'Roles'}</Label>
                            <div className="flex flex-wrap gap-2">
                              {(['admin', 'super_user', 'audit', 'user'] as const).map(r => {
                                const checked = roleFilters.includes(r);
                                return (
                                  <Button
                                    key={r}
                                    type="button"
                                    variant={checked ? 'default' : 'outline'}
                                    onClick={() => setRoleFilters(prev => (checked ? prev.filter(x => x !== r) : [...prev, r]))}
                                  >
                                    {r}
                                  </Button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {bMode === 'manual' ? (
                        <div className="space-y-2">
                          <Label>{language === 'ar' ? 'اختر المستخدمين' : 'Pick users'}</Label>
                          <div className="max-h-64 overflow-auto border rounded-md p-2 space-y-2">
                            {manualUsers.map(u => {
                              const checked = manualSelected.includes(u.id);
                              return (
                                <label key={u.id} className="flex items-center gap-2 text-sm">
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(v: any) => setManualSelected(prev => (v ? [...prev, u.id] : prev.filter(x => x !== u.id)))}
                                  />
                                  <span className="truncate">{u.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      <div className="space-y-2">
                        <Label>{language === 'ar' ? 'المحتوى' : 'Message'}</Label>
                        <Textarea value={bBody} onChange={e => setBBody(e.target.value)} rows={4} placeholder={language === 'ar' ? 'اكتب الرسالة...' : 'Write your message...'} />
                      </div>

                      <Button onClick={() => void sendBroadcast()} disabled={sending} className="w-full">
                        {language === 'ar' ? 'إرسال' : 'Send'}
                      </Button>
                    </CardContent>
                  </Card>
                ) : null}

                <Card>
                  <CardHeader>
                    <CardTitle>{language === 'ar' ? 'رسالة للإدارة' : 'Message to Admin'}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{language === 'ar' ? 'العنوان' : 'Title'}</Label>
                        <Input value={aTitle} onChange={e => setATitle(e.target.value)} placeholder={language === 'ar' ? 'عنوان الرسالة' : 'Message title'} />
                      </div>
                      <label className="flex items-center gap-2 mt-6">
                        <Checkbox checked={aAnon} onCheckedChange={(v: any) => setAAnon(Boolean(v))} />
                        <span className="text-sm">{language === 'ar' ? 'إرسال مجهول (بدون هوية)' : 'Send anonymously'}</span>
                      </label>
                    </div>
                    <div className="space-y-2">
                      <Label>{language === 'ar' ? 'المحتوى' : 'Message'}</Label>
                      <Textarea value={aBody} onChange={e => setABody(e.target.value)} rows={4} placeholder={language === 'ar' ? 'اكتب الرسالة...' : 'Write your message...'} />
                    </div>
                    <Button onClick={() => void sendToAdmin()} disabled={sending} className="w-full">
                      {language === 'ar' ? 'إرسال للإدارة' : 'Send to Admin'}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <Card className="min-h-[420px]">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{language === 'ar' ? 'صندوق الوارد' : 'Inbox'}</span>
                    <Button variant="outline" onClick={() => void loadInbox()} disabled={loadingInbox}>
                      {language === 'ar' ? 'تحديث' : 'Refresh'}
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="max-h-[420px] overflow-auto border rounded-md">
                        {inbox.length === 0 ? (
                          <div className="p-4 text-sm text-muted-foreground">{language === 'ar' ? 'لا توجد رسائل' : 'No messages yet'}</div>
                        ) : (
                          inbox.map(r => {
                            const isSel = selected?.message_id === r.message_id;
                            return (
                              <button
                                key={r.message_id}
                                className={`w-full text-left p-3 border-b last:border-b-0 hover:bg-muted ${isSel ? 'bg-muted' : ''}`}
                                onClick={() => {
                                  setSelected(r);
                                  void markRead(r);
                                }}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="font-medium truncate">{r.messages?.title}</div>
                                  {!r.read_at ? <span className="text-xs text-destructive">●</span> : null}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">{r.messages?.body}</div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                      {!selected ? (
                        <div className="text-sm text-muted-foreground">{language === 'ar' ? 'اختر رسالة' : 'Select a message'}</div>
                      ) : (
                        <>
                          <div className="font-semibold">{selected.messages?.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(selected.messages?.created_at).toLocaleString()}
                          </div>
                          <Separator />
                          <div className="whitespace-pre-wrap text-sm">{selected.messages?.body}</div>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="notifications">
            {/* Minimal full view (admin only) */}
            <Card>
              <CardHeader>
                <CardTitle>{language === 'ar' ? 'الإشعارات' : 'Notifications'}</CardTitle>
              </CardHeader>
              <CardContent>
                <NotificationsList />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

const NotificationsList: React.FC = () => {
  const { language } = useLanguage();
  const { user, role } = useSupabaseAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!user || role !== 'admin') return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setItems((data as any) || []);
    } catch (e: any) {
      console.error(e);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: e?.message || (language === 'ar' ? 'فشل تحميل الإشعارات' : 'Failed to load notifications'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, role]);

  if (role !== 'admin') return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{language === 'ar' ? 'آخر الإشعارات' : 'Latest notifications'}</div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          {language === 'ar' ? 'تحديث' : 'Refresh'}
        </Button>
      </div>
      <div className="border rounded-md divide-y">
        {items.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">{language === 'ar' ? 'لا توجد إشعارات' : 'No notifications'}</div>
        ) : (
          items.map(n => (
            <div key={n.id} className="p-3">
              <div className="font-medium text-sm">{n.title || n.type}</div>
              <div className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</div>
              {n.message ? <div className="text-sm mt-2 whitespace-pre-wrap">{n.message}</div> : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default MessagesPage;
