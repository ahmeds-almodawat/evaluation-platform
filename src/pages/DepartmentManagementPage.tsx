import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import Header from '@/components/layout/Header';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Building2, Plus, Link2, Trash2, Edit2, Users, ArrowRightLeft, UserPlus, UserMinus, Upload, Download, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';

interface Department {
  id: string;
  name_en: string;
  name_ar: string;
  created_at: string;
}

interface DepartmentLink {
  id: string;
  source_department_id: string;
  target_department_id: string;
  source_department?: Department;
  target_department?: Department;
}

type ProfileRow = {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  email: string | null;
  staff_id: string | null;
  department_id: string | null;
  is_active: boolean | null;
};


type DepartmentImportAction = 'create' | 'existing' | 'duplicate' | 'invalid';

type DepartmentImportRow = {
  rowNumber: number;
  name_en: string;
  name_ar: string;
  code: string;
  action: DepartmentImportAction;
  reason: string;
};

const normalizeDepartmentText = (value: unknown) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const getImportCell = (row: Record<string, unknown>, aliases: string[]) => {
  const normalizedAliasSet = new Set(aliases.map(normalizeDepartmentText));
  const foundKey = Object.keys(row).find((key) => normalizedAliasSet.has(normalizeDepartmentText(key)));
  return foundKey ? String(row[foundKey] ?? '').trim() : '';
};

const downloadDepartmentsTemplate = () => {
  const rows = [
    {
      department_name_en: 'Internal Medicine',
      department_name_ar: 'الطب الداخلي',
      department_code: 'MED-IM',
      notes: 'department_code is optional and used for your reference only',
    },
    {
      department_name_en: 'Critical Care Medicine',
      department_name_ar: 'طب العناية المركزة',
      department_code: 'MED-CCM',
      notes: 'Existing departments will be skipped during import',
    },
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Departments_Upload');
  XLSX.writeFile(wb, 'departments_upload_template.xlsx');
};

const DepartmentManagementPage: React.FC = () => {
  const { language } = useLanguage();
  const { role } = useSupabaseAuth();
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentLinks, setDepartmentLinks] = useState<DepartmentLink[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Department form state
  const [showDeptForm, setShowDeptForm] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  
  // Link form state
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [sourceDeptId, setSourceDeptId] = useState('');
  const [targetDeptId, setTargetDeptId] = useState('');

  // Members (interactive)
  const [membersOpen, setMembersOpen] = useState(false);
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [deptMembers, setDeptMembers] = useState<ProfileRow[]>([]);
  const [memberSearch, setMemberSearch] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [addConfirmLoading, setAddConfirmLoading] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidates, setCandidates] = useState<ProfileRow[]>([]);

  // Department import state
  const [deptImportOpen, setDeptImportOpen] = useState(false);
  const [deptImportRows, setDeptImportRows] = useState<DepartmentImportRow[]>([]);
  const [deptImportLoading, setDeptImportLoading] = useState(false);
  const [deptImportFileName, setDeptImportFileName] = useState('');

  // Redirect if not authorized
  if (role !== 'admin' && role !== 'super_user') {
    return <Navigate to="/" replace />;
  }

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch departments
      const { data: deptData, error: deptError } = await supabase
        .from('departments')
        .select('*')
        .order('name_en');
      
      if (deptError) throw deptError;
      setDepartments(deptData || []);

      // Fetch department links
      const { data: linksData, error: linksError } = await supabase
        .from('department_links')
        .select('*');
      
      if (linksError) throw linksError;
      setDepartmentLinks(linksData || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDepartment = async () => {
    if (!nameEn.trim() || !nameAr.trim()) {
      toast.error(language === 'ar' ? 'يرجى ملء جميع الحقول' : 'Please fill all fields');
      return;
    }

    try {
      if (editingDept) {
        const { error } = await supabase
          .from('departments')
          .update({ name_en: nameEn, name_ar: nameAr })
          .eq('id', editingDept.id);
        
        if (error) throw error;
        toast.success(language === 'ar' ? 'تم تحديث القسم' : 'Department updated');
      } else {
        const { error } = await supabase
          .from('departments')
          .insert({ name_en: nameEn, name_ar: nameAr });
        
        if (error) throw error;
        toast.success(language === 'ar' ? 'تم إضافة القسم' : 'Department added');
      }
      
      setShowDeptForm(false);
      setEditingDept(null);
      setNameEn('');
      setNameAr('');
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDeleteDepartment = async (id: string) => {
    if (!confirm(language === 'ar' ? 'هل أنت متأكد من حذف هذا القسم؟' : 'Are you sure you want to delete this department?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('departments')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      toast.success(language === 'ar' ? 'تم حذف القسم' : 'Department deleted');
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleAddLink = async () => {
    if (!sourceDeptId || !targetDeptId) {
      toast.error(language === 'ar' ? 'يرجى اختيار القسمين' : 'Please select both departments');
      return;
    }

    if (sourceDeptId === targetDeptId) {
      toast.error(language === 'ar' ? 'لا يمكن ربط القسم بنفسه' : 'Cannot link a department to itself');
      return;
    }

    try {
      const { error } = await supabase
        .from('department_links')
        .insert({ 
          source_department_id: sourceDeptId, 
          target_department_id: targetDeptId 
        });
      
      if (error) throw error;
      toast.success(language === 'ar' ? 'تم ربط الأقسام' : 'Departments linked');
      setShowLinkForm(false);
      setSourceDeptId('');
      setTargetDeptId('');
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDeleteLink = async (id: string) => {
    try {
      const { error } = await supabase
        .from('department_links')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      toast.success(language === 'ar' ? 'تم إلغاء الربط' : 'Link removed');
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const getDepartmentName = (id: string) => {
    const dept = departments.find(d => d.id === id);
    return dept ? (language === 'ar' ? dept.name_ar : dept.name_en) : '';
  };

  const openEditForm = (dept: Department) => {
    setEditingDept(dept);
    setNameEn(dept.name_en);
    setNameAr(dept.name_ar);
    setShowDeptForm(true);
  };

  const openMembers = (dept: Department) => {
    navigate(`/departments/${dept.id}`);
  };

  const refreshMembers = async (deptId: string) => {
    setMembersLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,name_en,name_ar,email,staff_id,department_id,is_active')
        .eq('department_id', deptId)
        .order('name_en', { ascending: true });
      if (error) throw error;
      setDeptMembers((data as any) || []);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load department members');
    } finally {
      setMembersLoading(false);
    }
  };

  const removeFromDepartment = async (userId: string) => {
    if (!selectedDept) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ department_id: null })
        .eq('id', userId);
      if (error) throw error;
      toast.success(language === 'ar' ? 'تم إزالة الموظف من القسم' : 'Employee removed from department');
      refreshMembers(selectedDept.id);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update employee');
    }
  };

  const transferToDepartment = async (userId: string, newDeptId: string) => {
    if (!selectedDept) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ department_id: newDeptId })
        .eq('id', userId);
      if (error) throw error;
      toast.success(language === 'ar' ? 'تم نقل الموظف' : 'Employee transferred');
      refreshMembers(selectedDept.id);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to transfer employee');
    }
  };

  const searchCandidates = async () => {
    const term = candidateSearch.trim();
    if (!term) {
      setCandidates([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,name_en,name_ar,email,staff_id,department_id,is_active')
        .or(`name_en.ilike.%${term}%,name_ar.ilike.%${term}%,email.ilike.%${term}%,staff_id.ilike.%${term}%`)
        .order('name_en', { ascending: true })
        .limit(25);
      if (error) throw error;
      setCandidates((data as any) || []);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to search users');
    }
  };

  const addToDepartment = async (userId: string) => {
    if (!selectedDept) return;
    setAddConfirmLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ department_id: selectedDept.id })
        .eq('id', userId);
      if (error) throw error;
      toast.success(language === 'ar' ? 'تمت إضافة الموظف للقسم' : 'Employee added to department');
      setAddOpen(false);
      setCandidateSearch('');
      setCandidates([]);
      refreshMembers(selectedDept.id);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add employee');
    } finally {
      setAddConfirmLoading(false);
    }
  };

  const parseDepartmentImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setDeptImportLoading(true);
    setDeptImportFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) {
        toast.error(language === 'ar' ? 'الملف لا يحتوي على شيت صالح' : 'The file has no valid worksheet');
        return;
      }

      const worksheet = workbook.Sheets[firstSheet];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
      const existingEnglish = new Set(departments.map((d) => normalizeDepartmentText(d.name_en)));
      const existingArabic = new Set(departments.map((d) => normalizeDepartmentText(d.name_ar)));
      const seenNew = new Set<string>();

      const parsedRows: DepartmentImportRow[] = rawRows
        .map((row, index) => {
          const name_en = getImportCell(row, [
            'department_name_en',
            'name_en',
            'department en',
            'department_en',
            'name (english)',
            'english name',
          ]);
          const name_ar = getImportCell(row, [
            'department_name_ar',
            'name_ar',
            'department ar',
            'department_ar',
            'name (arabic)',
            'arabic name',
          ]);
          const code = getImportCell(row, ['department_code', 'code', 'dept_code', 'dep_code']);
          const enKey = normalizeDepartmentText(name_en);
          const arKey = normalizeDepartmentText(name_ar);
          const rowKey = enKey || arKey;

          if (!name_en || !name_ar) {
            return {
              rowNumber: index + 2,
              name_en,
              name_ar,
              code,
              action: 'invalid' as const,
              reason: language === 'ar' ? 'يجب إدخال الاسم بالإنجليزية والعربية' : 'Both English and Arabic names are required',
            };
          }

          if (existingEnglish.has(enKey) || existingArabic.has(arKey)) {
            return {
              rowNumber: index + 2,
              name_en,
              name_ar,
              code,
              action: 'existing' as const,
              reason: language === 'ar' ? 'القسم موجود بالفعل وسيتم تخطيه' : 'Already exists and will be skipped',
            };
          }

          if (seenNew.has(rowKey)) {
            return {
              rowNumber: index + 2,
              name_en,
              name_ar,
              code,
              action: 'duplicate' as const,
              reason: language === 'ar' ? 'مكرر داخل ملف الرفع وسيتم تخطيه' : 'Duplicate inside upload file and will be skipped',
            };
          }

          seenNew.add(rowKey);
          return {
            rowNumber: index + 2,
            name_en,
            name_ar,
            code,
            action: 'create' as const,
            reason: language === 'ar' ? 'سيتم إنشاء هذا القسم' : 'Will be created',
          };
        })
        .filter((row) => row.name_en || row.name_ar || row.code);

      setDeptImportRows(parsedRows);
      setDeptImportOpen(true);
      if (parsedRows.length === 0) {
        toast.warning(language === 'ar' ? 'لا توجد صفوف صالحة في الملف' : 'No usable rows found in the file');
      }
    } catch (e: any) {
      toast.error(e?.message || (language === 'ar' ? 'فشل قراءة الملف' : 'Failed to read import file'));
    } finally {
      setDeptImportLoading(false);
    }
  };

  const confirmDepartmentImport = async () => {
    const createRows = deptImportRows
      .filter((row) => row.action === 'create')
      .map((row) => ({ name_en: row.name_en.trim(), name_ar: row.name_ar.trim() }));

    if (createRows.length === 0) {
      toast.info(language === 'ar' ? 'لا توجد أقسام جديدة للإنشاء' : 'No new departments to create');
      return;
    }

    setDeptImportLoading(true);
    try {
      const chunkSize = 500;
      for (let i = 0; i < createRows.length; i += chunkSize) {
        const chunk = createRows.slice(i, i + chunkSize);
        const { error } = await supabase.from('departments').insert(chunk);
        if (error) throw error;
      }
      toast.success(
        language === 'ar'
          ? `تم إنشاء ${createRows.length} قسم بنجاح`
          : `${createRows.length} departments created successfully`,
      );
      setDeptImportOpen(false);
      setDeptImportRows([]);
      setDeptImportFileName('');
      fetchData();
    } catch (e: any) {
      toast.error(e?.message || (language === 'ar' ? 'فشل استيراد الأقسام' : 'Department import failed'));
    } finally {
      setDeptImportLoading(false);
    }
  };

  const deptImportCreateCount = deptImportRows.filter((row) => row.action === 'create').length;
  const deptImportExistingCount = deptImportRows.filter((row) => row.action === 'existing').length;
  const deptImportIssueCount = deptImportRows.filter((row) => row.action === 'duplicate' || row.action === 'invalid').length;

  return (
    <div className="min-h-screen bg-background">
      <Header title={language === 'ar' ? 'إدارة الأقسام' : 'Department Management'} />
      
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in-up">
          <div>
            <h2 className="text-2xl font-bold text-foreground">
              {language === 'ar' ? 'الأقسام' : 'Departments'}
            </h2>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' 
                ? 'إدارة الأقسام وربطها للتقييم المشترك'
                : 'Manage departments and link them for cross-evaluation'}
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={downloadDepartmentsTemplate}>
              <Download className="w-4 h-4" />
              {language === 'ar' ? 'قالب الأقسام' : 'Dept Template'}
            </Button>
            <Button variant="outline" className="gap-2" asChild>
              <label className="cursor-pointer">
                {deptImportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {language === 'ar' ? 'رفع أقسام XLS' : 'Import Departments XLS'}
                <input
                  type="file"
                  className="hidden"
                  accept=".xlsx,.xls,.csv"
                  onChange={parseDepartmentImportFile}
                />
              </label>
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setShowLinkForm(true)}>
              <Link2 className="w-4 h-4" />
              {language === 'ar' ? 'ربط الأقسام' : 'Link Departments'}
            </Button>
            <Button className="gap-2" onClick={() => {
              setEditingDept(null);
              setNameEn('');
              setNameAr('');
              setShowDeptForm(true);
            }}>
              <Plus className="w-4 h-4" />
              {language === 'ar' ? 'قسم جديد' : 'New Department'}
            </Button>
          </div>
        </div>

        {/* Departments Table */}
        <div className="bg-card rounded-xl shadow-md border border-border/50 overflow-hidden animate-fade-in-up">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{language === 'ar' ? 'الاسم بالإنجليزية' : 'Name (English)'}</TableHead>
                <TableHead>{language === 'ar' ? 'الاسم بالعربية' : 'Name (Arabic)'}</TableHead>
                <TableHead>{language === 'ar' ? 'الأقسام المرتبطة' : 'Linked Departments'}</TableHead>
                <TableHead className="text-right">{language === 'ar' ? 'الإجراءات' : 'Actions'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.map((dept) => {
                const linkedDepts = departmentLinks
                  .filter(l => l.source_department_id === dept.id || l.target_department_id === dept.id)
                  .map(l => l.source_department_id === dept.id ? l.target_department_id : l.source_department_id);
                
                return (
                  <TableRow key={dept.id}>
                    <TableCell className="font-medium">{dept.name_en}</TableCell>
                    <TableCell>{dept.name_ar}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {linkedDepts.length > 0 ? (
                          linkedDepts.map(linkedId => (
                            <span key={linkedId} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-primary/10 text-primary">
                              {getDepartmentName(linkedId)}
                            </span>
                          ))
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            {language === 'ar' ? 'لا توجد روابط' : 'No links'}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openMembers(dept)} title={language === 'ar' ? 'إدارة الموظفين' : 'Manage employees'}>
                          <Users className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEditForm(dept)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteDepartment(dept.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {departments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    {language === 'ar' ? 'لا توجد أقسام' : 'No departments found'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Department Links Section */}
        <div className="bg-card rounded-xl shadow-md border border-border/50 p-6 animate-fade-in-up">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            {language === 'ar' ? 'روابط الأقسام للتقييم المشترك' : 'Department Links for Cross-Evaluation'}
          </h3>
          
          <div className="space-y-2">
            {departmentLinks.map((link) => (
              <div key={link.id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{getDepartmentName(link.source_department_id)}</span>
                  <span className="text-muted-foreground">↔</span>
                  <span className="font-medium">{getDepartmentName(link.target_department_id)}</span>
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleDeleteLink(link.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ))}
            {departmentLinks.length === 0 && (
              <p className="text-center py-4 text-muted-foreground">
                {language === 'ar' ? 'لا توجد روابط بين الأقسام' : 'No department links found'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit Department Modal */}
      <Dialog open={showDeptForm} onOpenChange={setShowDeptForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              {editingDept 
                ? (language === 'ar' ? 'تعديل القسم' : 'Edit Department')
                : (language === 'ar' ? 'إضافة قسم جديد' : 'Add New Department')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>{language === 'ar' ? 'الاسم بالإنجليزية' : 'Name (English)'}</Label>
              <Input 
                value={nameEn} 
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g., Human Resources"
              />
            </div>
            <div>
              <Label>{language === 'ar' ? 'الاسم بالعربية' : 'Name (Arabic)'}</Label>
              <Input 
                value={nameAr} 
                onChange={(e) => setNameAr(e.target.value)}
                placeholder="مثال: الموارد البشرية"
                dir="rtl"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowDeptForm(false)}>
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button onClick={handleSaveDepartment}>
                {editingDept 
                  ? (language === 'ar' ? 'حفظ التغييرات' : 'Save Changes')
                  : (language === 'ar' ? 'إضافة القسم' : 'Add Department')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Link Departments Modal */}
      <Dialog open={showLinkForm} onOpenChange={setShowLinkForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              {language === 'ar' ? 'ربط الأقسام' : 'Link Departments'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {language === 'ar' 
                ? 'ربط الأقسام يسمح للموظفين بتقييم زملائهم في الأقسام المرتبطة'
                : 'Linking departments allows employees to evaluate colleagues in linked departments'}
            </p>
            
            <div>
              <Label>{language === 'ar' ? 'القسم الأول' : 'First Department'}</Label>
              <Select value={sourceDeptId} onValueChange={setSourceDeptId}>
                <SelectTrigger>
                  <SelectValue placeholder={language === 'ar' ? 'اختر القسم' : 'Select department'} />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {language === 'ar' ? dept.name_ar : dept.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>{language === 'ar' ? 'القسم الثاني' : 'Second Department'}</Label>
              <Select value={targetDeptId} onValueChange={setTargetDeptId}>
                <SelectTrigger>
                  <SelectValue placeholder={language === 'ar' ? 'اختر القسم' : 'Select department'} />
                </SelectTrigger>
                <SelectContent>
                  {departments.filter(d => d.id !== sourceDeptId).map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {language === 'ar' ? dept.name_ar : dept.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowLinkForm(false)}>
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button onClick={handleAddLink}>
                {language === 'ar' ? 'ربط الأقسام' : 'Link Departments'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Departments Preview */}
      <Dialog open={deptImportOpen} onOpenChange={setDeptImportOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              {language === 'ar' ? 'معاينة استيراد الأقسام' : 'Department Import Preview'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">{language === 'ar' ? 'الملف' : 'File'}</div>
                <div className="font-medium truncate" title={deptImportFileName}>{deptImportFileName || '—'}</div>
              </div>
              <div className="rounded-lg border p-3 bg-emerald-50 dark:bg-emerald-950/20">
                <div className="text-xs text-muted-foreground">{language === 'ar' ? 'سيتم إنشاؤها' : 'To create'}</div>
                <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{deptImportCreateCount}</div>
              </div>
              <div className="rounded-lg border p-3 bg-slate-50 dark:bg-slate-950/20">
                <div className="text-xs text-muted-foreground">{language === 'ar' ? 'موجودة مسبقاً' : 'Existing / skipped'}</div>
                <div className="text-xl font-bold">{deptImportExistingCount}</div>
              </div>
              <div className="rounded-lg border p-3 bg-amber-50 dark:bg-amber-950/20">
                <div className="text-xs text-muted-foreground">{language === 'ar' ? 'تحتاج مراجعة' : 'Needs review'}</div>
                <div className="text-xl font-bold text-amber-700 dark:text-amber-300">{deptImportIssueCount}</div>
              </div>
            </div>

            <div className="rounded-lg border overflow-hidden max-h-[420px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === 'ar' ? 'الصف' : 'Row'}</TableHead>
                    <TableHead>{language === 'ar' ? 'الاسم بالإنجليزية' : 'Name EN'}</TableHead>
                    <TableHead>{language === 'ar' ? 'الاسم بالعربية' : 'Name AR'}</TableHead>
                    <TableHead>{language === 'ar' ? 'الكود' : 'Code'}</TableHead>
                    <TableHead>{language === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                    <TableHead>{language === 'ar' ? 'ملاحظة' : 'Note'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deptImportRows.map((row, idx) => (
                    <TableRow key={`${row.rowNumber}-${idx}`}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell className="font-medium">{row.name_en || '—'}</TableCell>
                      <TableCell dir="rtl">{row.name_ar || '—'}</TableCell>
                      <TableCell>{row.code || '—'}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                          row.action === 'create'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : row.action === 'existing'
                              ? 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                        }`}>
                          {row.action === 'create' ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                          {row.action}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.reason}</TableCell>
                    </TableRow>
                  ))}
                  {deptImportRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {language === 'ar' ? 'لا توجد صفوف للمعاينة' : 'No rows to preview'}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
              {language === 'ar'
                ? 'الاستيراد سيُنشئ الأقسام الجديدة فقط. الأقسام الموجودة والمكررة أو الناقصة سيتم تخطيها.'
                : 'Import creates only new departments. Existing, duplicate, or incomplete rows will be skipped.'}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeptImportOpen(false)} disabled={deptImportLoading}>
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button onClick={confirmDepartmentImport} disabled={deptImportLoading || deptImportCreateCount === 0}>
                {deptImportLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {language === 'ar' ? 'إنشاء الأقسام الجديدة' : 'Create New Departments'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Department Members Modal */}
      
      {/* Add Employee to Department */}
      <Dialog open={addOpen} onOpenChange={(v) => { setAddOpen(v); if (!v) { setCandidateSearch(''); setCandidates([]); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              {language === 'ar' ? 'إضافة موظف للقسم' : 'Add employee to department'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              value={candidateSearch}
              onChange={(e) => setCandidateSearch(e.target.value)}
              placeholder={language === 'ar' ? 'ابحث بالاسم/الإيميل/الرقم الوظيفي...' : 'Search by name/email/staff id...'}
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={searchCandidates} disabled={!candidateSearch.trim()}>
                {language === 'ar' ? 'بحث' : 'Search'}
              </Button>
              <div className="flex-1" />
              <Button type="button" variant="secondary" onClick={() => { setCandidateSearch(''); setCandidates([]); }}>
                {language === 'ar' ? 'مسح' : 'Clear'}
              </Button>
            </div>

            <div className="rounded-lg border overflow-hidden max-h-[360px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === 'ar' ? 'المستخدم' : 'User'}</TableHead>
                    <TableHead>{language === 'ar' ? 'القسم الحالي' : 'Current dept'}</TableHead>
                    <TableHead className="text-right">{language === 'ar' ? 'إضافة' : 'Add'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium">
                          {language === 'ar' ? (c.name_ar || c.name_en || '—') : (c.name_en || c.name_ar || '—')}
                        </div>
                        <div className="text-xs text-muted-foreground">{c.email || c.staff_id || c.id}</div>
                      </TableCell>
                      <TableCell>{c.department_id ? getDepartmentName(c.department_id) : (language === 'ar' ? 'بدون' : 'None')}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          onClick={() => addToDepartment(c.id)}
                          disabled={addConfirmLoading}
                        >
                          {language === 'ar' ? 'إضافة' : 'Add'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {candidates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        {language === 'ar' ? 'ابحث لعرض النتائج' : 'Search to see results'}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DepartmentManagementPage;
