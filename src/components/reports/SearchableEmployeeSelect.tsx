import React, { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';

type Employee = {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  email: string | null;
  position: string | null;
  department_id: string | null;
  staff_id?: string | null;
};

type SearchableEmployeeSelectProps = {
  employees: Employee[];
  selectedUserId: string | null;
  language: 'ar' | 'en' | string;
  loading?: boolean;
  onSelect: (id: string) => void;
};

const employeeLabel = (employee: Employee, language: string) => {
  const name = language === 'ar' ? employee.name_ar : employee.name_en;
  return name || employee.email || employee.staff_id || employee.id;
};

const SearchableEmployeeSelect: React.FC<SearchableEmployeeSelectProps> = ({
  employees,
  selectedUserId,
  language,
  loading = false,
  onSelect,
}) => {
  const selected = employees.find((employee) => employee.id === selectedUserId) ?? null;
  const [query, setQuery] = useState(selected ? employeeLabel(selected, language) : '');
  const [open, setOpen] = useState(false);

  React.useEffect(() => {
    if (!open && selected) {
      setQuery(employeeLabel(selected, language));
    }
  }, [language, open, selected?.id]);

  const filteredEmployees = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return employees.slice(0, 30);

    return employees
      .filter((employee) =>
        [employee.name_en, employee.name_ar, employee.email, employee.staff_id, employee.position]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(normalized),
      )
      .slice(0, 50);
  }, [employees, query]);

  return (
    <div className="relative">
      <Input
        className="mt-1"
        value={query}
        placeholder={language === 'ar' ? 'اكتب الاسم أو البريد أو الرقم...' : 'Type name, email, or ID...'}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
      />
      {open ? (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {loading ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {language === 'ar' ? 'جاري تحميل الموظفين...' : 'Loading employees...'}
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {language === 'ar' ? 'لا توجد نتائج' : 'No results found'}
            </div>
          ) : (
            filteredEmployees.map((employee) => (
              <button
                key={employee.id}
                type="button"
                className={`w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground ${employee.id === selectedUserId ? 'bg-accent text-accent-foreground' : ''}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setQuery(employeeLabel(employee, language));
                  setOpen(false);
                  onSelect(employee.id);
                }}
              >
                <div className="font-medium">{employeeLabel(employee, language)}</div>
                <div className="text-xs text-muted-foreground">
                  {[employee.email, employee.staff_id].filter(Boolean).join(' • ') || '—'}
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
};

export default SearchableEmployeeSelect;
