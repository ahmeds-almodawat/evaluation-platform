import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';

export type AnonymizedCommentItem = {
  id: string;
  created_at: string;
  comment: string;
};

interface CommentsSectionProps {
  comments?: AnonymizedCommentItem[];
}

const CommentsSection: React.FC<CommentsSectionProps> = ({ comments }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { t, language } = useLanguage();

  const sorted = useMemo(() => {
    return (comments || [])
      .filter((c) => c.comment && String(c.comment).trim())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 25);
  }, [comments]);

  return (
    <div className="chart-container animate-fade-in-up">
      <Button
        variant="ghost"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-0 hover:bg-transparent"
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">
            {t('report.comments')}
          </h3>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        )}
      </Button>

      {isExpanded && (
        <div className="mt-4 space-y-3">
          {sorted.length === 0 ? (
            <div className="p-4 bg-secondary/30 rounded-lg border border-border/50 text-sm text-muted-foreground">
              {language === 'ar' ? 'لا توجد تعليقات بعد' : 'No comments yet'}
            </div>
          ) : (
            sorted.map((comment, index) => (
              <div
                key={comment.id}
                className="p-4 bg-secondary/50 rounded-lg border border-border/50 animate-fade-in-up"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <p className="text-sm text-foreground leading-relaxed">
                  {comment.comment}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {new Date(comment.created_at).toLocaleDateString(language === 'ar' ? 'ar' : 'en', {
                    year: 'numeric',
                    month: 'short',
                    day: '2-digit',
                  })}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default CommentsSection;
