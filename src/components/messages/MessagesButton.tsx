import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';

const MessagesButton: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useSupabaseAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!user) return;
      const { count, error } = await supabase
        .from('message_recipients')
        .select('message_id', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .is('read_at', null);
      if (!mounted) return;
      if (!error) setUnread(count || 0);
    };

    void load();
    const t = window.setInterval(load, 30_000);
    return () => {
      mounted = false;
      window.clearInterval(t);
    };
  }, [user]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      onClick={() => navigate('/messages')}
      aria-label="Messages"
    >
      <Mail className="h-5 w-5" />
      {unread > 0 ? (
        <Badge
          variant="destructive"
          className="absolute -top-1 -right-1 h-5 min-w-5 px-1 flex items-center justify-center text-[10px]"
        >
          {unread > 99 ? '99+' : unread}
        </Badge>
      ) : null}
    </Button>
  );
};

export default MessagesButton;
