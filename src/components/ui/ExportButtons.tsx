import React from 'react';
import { FileText, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from './button';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

interface ExportButtonsProps {
  /** Preferred prop names */
  onExportPDF?: () => void | Promise<void>;
  onExportExcel?: () => void | Promise<void>;
  /** Back-compat: some pages already use these */
  onPDF?: () => void | Promise<void>;
  onExcel?: () => void | Promise<void>;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
}

const ExportButtons: React.FC<ExportButtonsProps> = ({
  onExportPDF,
  onExportExcel,
  onPDF,
  onExcel,
  disabled,
  busy,
  className,
}) => {
  const { t, language } = useLanguage();
  const { toast } = useToast();

  const pdfHandler = onExportPDF ?? onPDF;
  const excelHandler = onExportExcel ?? onExcel;

  const handleExportPDF = () => {
    if (disabled || busy) return;
    if (pdfHandler) return pdfHandler();
    toast({
      title: language === 'ar' ? 'غير متاح' : 'Not available',
      description: language === 'ar'
        ? 'تصدير PDF غير مُعدّ على هذه الشاشة بعد.'
        : 'PDF export is not configured on this screen yet.',
      variant: 'destructive',
    });
  };

  const handleExportExcel = () => {
    if (disabled || busy) return;
    if (excelHandler) return excelHandler();
    toast({
      title: language === 'ar' ? 'غير متاح' : 'Not available',
      description: language === 'ar'
        ? 'تصدير Excel غير مُعدّ على هذه الشاشة بعد.'
        : 'Excel export is not configured on this screen yet.',
      variant: 'destructive',
    });
  };

  const isDisabled = Boolean(disabled || busy);

  return (
    <div className={cn('flex flex-col sm:flex-row items-stretch sm:items-center gap-2', className)}>
      <Button
        onClick={handleExportPDF}
        className={cn('export-btn-pdf w-full sm:w-auto justify-center', isDisabled && 'opacity-60 pointer-events-none')}
        size="sm"
        aria-label={language === 'ar' ? 'تصدير PDF' : 'Export PDF'}
        type="button"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
        <span className="hidden sm:inline">{t('action.pdf')}</span>
      </Button>
      <Button
        onClick={handleExportExcel}
        className={cn('export-btn-excel w-full sm:w-auto justify-center', isDisabled && 'opacity-60 pointer-events-none')}
        size="sm"
        aria-label={language === 'ar' ? 'تصدير Excel' : 'Export Excel'}
        type="button"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
        <span className="hidden sm:inline">{t('action.excel')}</span>
      </Button>
    </div>
  );
};

export default ExportButtons;
