import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Star, User, Building2, Send, X, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Profile {
  id: string;
  name_en: string;
  name_ar: string;
  email: string;
  department_id: string | null;
}
interface EvaluationFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ScoreOption {
  value: number;
  labelEn: string;
  labelAr: string;
  color: string;
}

const scoreOptions: ScoreOption[] = [
  { value: 1, labelEn: 'Bad', labelAr: 'سيء', color: 'bg-danger' },
  { value: 2, labelEn: 'Neutral', labelAr: 'محايد', color: 'bg-warning' },
  { value: 3, labelEn: 'Good', labelAr: 'جيد', color: 'bg-success' },
  { value: 4, labelEn: 'Excellent', labelAr: 'ممتاز', color: 'bg-success' },
  { value: 5, labelEn: 'Outstanding', labelAr: 'استثنائي', color: 'bg-success' },
];

const EvaluationForm: React.FC<EvaluationFormProps> = ({ open, onOpenChange }) => {
  const { t, language } = useLanguage();
  const { toast } = useToast();

  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [evaluationType, setEvaluationType] = useState<'same' | 'cross'>('same');
  const [performance, setPerformance] = useState<number | null>(null);
  const [teamwork, setTeamwork] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  useEffect(() => {
    if (open) {
      fetchEmployees();
    }
  }, [open]);

  const fetchEmployees = async () => {
    setLoadingEmployees(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('id, name_en, name_ar, email, department_id')
        .neq('id', user.id) // Exclude current user
        .order('name_en');

      if (error) throw error;
      setEmployees(data || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
    } finally {
      setLoadingEmployees(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedEmployee || performance === null || teamwork === null) {
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar' 
          ? 'يرجى ملء جميع الحقول المطلوبة'
          : 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));

    toast({
      title: language === 'ar' ? 'تم الإرسال بنجاح' : 'Submitted Successfully',
      description: language === 'ar'
        ? 'تم حفظ التقييم بنجاح'
        : 'Your evaluation has been saved',
    });

    // Reset form
    setSelectedEmployee('');
    setPerformance(null);
    setTeamwork(null);
    setIsSubmitting(false);
    onOpenChange(false);
  };

  const ScoreSelector = ({
    label,
    value,
    onChange,
    required = false,
  }: {
    label: string;
    value: number | null;
    onChange: (val: number) => void;
    required?: boolean;
  }) => (
    <div className="space-y-3">
      <Label className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-danger ms-1">*</span>}
      </Label>
      <div className="flex gap-2">
        {scoreOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex-1 p-3 rounded-lg border-2 transition-all duration-200 ${
              value === option.value
                ? `border-primary ${option.color} text-white`
                : 'border-border hover:border-primary/50 bg-card'
            }`}
          >
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-1">
                {[...Array(option.value)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-4 h-4 ${
                      value === option.value ? 'fill-current' : 'fill-muted-foreground/30'
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs font-medium">
                {language === 'ar' ? option.labelAr : option.labelEn}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Star className="w-5 h-5 text-primary" />
            {language === 'ar' ? 'تقييم شهري جديد' : 'New Monthly Evaluation'}
          </DialogTitle>
          <DialogDescription>
            {language === 'ar'
              ? 'قيّم زميلك على الأداء والعمل الجماعي'
              : 'Rate your colleague on Performance and Teamwork'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Employee Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {language === 'ar' ? 'اختر الموظف' : 'Select Employee'}
              <span className="text-danger ms-1">*</span>
            </Label>
            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
              <SelectTrigger className="w-full">
                {loadingEmployees ? (
                  <Loader2 className="w-4 h-4 me-2 animate-spin text-muted-foreground" />
                ) : (
                  <User className="w-4 h-4 me-2 text-muted-foreground" />
                )}
                <SelectValue
                  placeholder={
                    language === 'ar' ? 'اختر الموظف للتقييم' : 'Choose employee to evaluate'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {employees.length === 0 ? (
                  <div className="p-2 text-center text-sm text-muted-foreground">
                    {language === 'ar' ? 'لا يوجد موظفون' : 'No employees found'}
                  </div>
                ) : (
                  employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {language === 'ar' ? emp.name_ar : emp.name_en}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Evaluation Type */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {language === 'ar' ? 'نوع التقييم' : 'Evaluation Type'}
            </Label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setEvaluationType('same')}
                className={`flex-1 p-3 rounded-lg border-2 transition-all ${
                  evaluationType === 'same'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Building2 className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    {language === 'ar' ? 'نفس القسم' : 'Same Department'}
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setEvaluationType('cross')}
                className={`flex-1 p-3 rounded-lg border-2 transition-all ${
                  evaluationType === 'cross'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Building2 className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    {language === 'ar' ? 'قسم آخر' : 'Cross Department'}
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* Score Selectors */}
          <div className="space-y-5 p-4 rounded-lg bg-secondary/30 border border-border/50">
            <ScoreSelector
              label={t('category.performance')}
              value={performance}
              onChange={setPerformance}
              required
            />
            <ScoreSelector
              label={t('category.teamwork')}
              value={teamwork}
              onChange={setTeamwork}
              required
            />
          </div>

        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            <X className="w-4 h-4 me-2" />
            {language === 'ar' ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            <Send className="w-4 h-4 me-2" />
            {isSubmitting
              ? language === 'ar'
                ? 'جاري الإرسال...'
                : 'Submitting...'
              : language === 'ar'
              ? 'إرسال التقييم'
              : 'Submit Evaluation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EvaluationForm;
