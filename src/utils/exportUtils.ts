import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

interface ExportData {
  title: string;
  subtitle?: string;
  date: string;
  sections: ExportSection[];
}

interface ExportSection {
  header: string;
  type: 'kpi' | 'table' | 'text';
  data: Record<string, any>[] | Record<string, any>;
}

// PDF Export Utility
export const exportToPDF = (data: ExportData, language: 'en' | 'ar' = 'en') => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let yPosition = margin;

  // Title
  doc.setFontSize(20);
  doc.setTextColor(74, 144, 226); // Primary blue
  doc.text(data.title, margin, yPosition);
  yPosition += 10;

  // Subtitle and date
  if (data.subtitle) {
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(data.subtitle, margin, yPosition);
    yPosition += 7;
  }

  doc.setFontSize(10);
  doc.setTextColor(150, 150, 150);
  doc.text(`${language === 'ar' ? 'التاريخ:' : 'Date:'} ${data.date}`, margin, yPosition);
  yPosition += 15;

  // Line separator
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 10;

  // Sections
  data.sections.forEach((section) => {
    // Check if we need a new page
    if (yPosition > 250) {
      doc.addPage();
      yPosition = margin;
    }

    // Section header
    doc.setFontSize(14);
    doc.setTextColor(50, 50, 50);
    doc.text(section.header, margin, yPosition);
    yPosition += 8;

    if (section.type === 'kpi') {
      // KPI cards - display as key-value pairs
      doc.setFontSize(11);
      const kpiData = section.data as Record<string, any>;
      Object.entries(kpiData).forEach(([key, value]) => {
        doc.setTextColor(100, 100, 100);
        doc.text(`${key}:`, margin, yPosition);
        doc.setTextColor(50, 50, 50);
        doc.text(String(value), margin + 50, yPosition);
        yPosition += 6;
      });
      yPosition += 5;
    } else if (section.type === 'table') {
      // Table data
      const tableData = section.data as Record<string, any>[];
      if (tableData.length > 0) {
        const headers = Object.keys(tableData[0]);
        const colWidth = (pageWidth - 2 * margin) / headers.length;

        // Table header
        doc.setFillColor(74, 144, 226);
        doc.rect(margin, yPosition - 4, pageWidth - 2 * margin, 8, 'F');
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        headers.forEach((header, i) => {
          doc.text(header, margin + i * colWidth + 2, yPosition);
        });
        yPosition += 8;

        // Table rows
        doc.setTextColor(50, 50, 50);
        tableData.forEach((row, rowIndex) => {
          if (yPosition > 270) {
            doc.addPage();
            yPosition = margin;
          }
          const bgColor = rowIndex % 2 === 0 ? 245 : 255;
          doc.setFillColor(bgColor, bgColor, bgColor);
          doc.rect(margin, yPosition - 4, pageWidth - 2 * margin, 7, 'F');
          
          headers.forEach((header, i) => {
            const value = String(row[header] ?? '');
            doc.text(value.substring(0, 20), margin + i * colWidth + 2, yPosition);
          });
          yPosition += 7;
        });
        yPosition += 5;
      }
    } else if (section.type === 'text') {
      // Text content
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      const textData = section.data as Record<string, any>;
      Object.entries(textData).forEach(([, value]) => {
        const lines = doc.splitTextToSize(String(value), pageWidth - 2 * margin);
        doc.text(lines, margin, yPosition);
        yPosition += lines.length * 5 + 3;
      });
      yPosition += 5;
    }
  });

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `${language === 'ar' ? 'صفحة' : 'Page'} ${i} / ${pageCount}`,
      pageWidth / 2,
      290,
      { align: 'center' }
    );
  }

  // Download
  doc.save(`${data.title.replace(/\s+/g, '_')}_${data.date}.pdf`);
};

// Excel Export Utility
export const exportToExcel = (data: ExportData, language: 'en' | 'ar' = 'en') => {
  const workbook = XLSX.utils.book_new();

  // Create summary sheet
  const summaryData = [
    [data.title],
    [data.subtitle || ''],
    [`${language === 'ar' ? 'التاريخ' : 'Date'}: ${data.date}`],
    [''],
  ];

  data.sections.forEach((section) => {
    summaryData.push([section.header]);
    
    if (section.type === 'kpi') {
      const kpiData = section.data as Record<string, any>;
      Object.entries(kpiData).forEach(([key, value]) => {
        summaryData.push([key, String(value)]);
      });
    } else if (section.type === 'table') {
      const tableData = section.data as Record<string, any>[];
      if (tableData.length > 0) {
        const headers = Object.keys(tableData[0]);
        summaryData.push(headers);
        tableData.forEach((row) => {
          summaryData.push(headers.map((h) => String(row[h] ?? '')));
        });
      }
    } else if (section.type === 'text') {
      const textData = section.data as Record<string, any>;
      Object.entries(textData).forEach(([key, value]) => {
        summaryData.push([key, String(value)]);
      });
    }
    summaryData.push(['']);
  });

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  
  // Set column widths
  summarySheet['!cols'] = [
    { wch: 25 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
  ];

  XLSX.utils.book_append_sheet(workbook, summarySheet, language === 'ar' ? 'ملخص' : 'Summary');

  // Create separate sheets for tables
  data.sections.forEach((section, index) => {
    if (section.type === 'table') {
      const tableData = section.data as Record<string, any>[];
      if (tableData.length > 0) {
        const tableSheet = XLSX.utils.json_to_sheet(tableData);
        const sheetName = section.header.substring(0, 30).replace(/[*?:/\\[\]]/g, '');
        XLSX.utils.book_append_sheet(workbook, tableSheet, sheetName || `Sheet${index + 1}`);
      }
    }
  });

  // Download
  XLSX.writeFile(workbook, `${data.title.replace(/\s+/g, '_')}_${data.date}.xlsx`);
};

// Employee Dashboard Export
export const exportEmployeeDashboard = (
  employee: { nameEn: string; nameAr: string; departmentNameEn: string; departmentNameAr: string },
  scores: { sameDeptScore: number; crossDeptScore: number; performance: number; teamwork: number; workload?: number },
  trendData: { month: string; sameDept: number; crossDept: number }[],
  language: 'en' | 'ar' = 'en',
  format: 'pdf' | 'excel' = 'pdf'
) => {
  const data: ExportData = {
    title: language === 'ar' ? 'تقرير الموظف' : 'Employee Report',
    subtitle: language === 'ar' ? employee.nameAr : employee.nameEn,
    date: new Date().toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US'),
    sections: [
      {
        header: language === 'ar' ? 'معلومات الموظف' : 'Employee Information',
        type: 'kpi',
        data: {
          [language === 'ar' ? 'الاسم' : 'Name']: language === 'ar' ? employee.nameAr : employee.nameEn,
          [language === 'ar' ? 'القسم' : 'Department']: language === 'ar' ? employee.departmentNameAr : employee.departmentNameEn,
        },
      },
      {
        header: language === 'ar' ? 'الدرجات الحالية' : 'Current Scores',
        type: 'kpi',
        data: {
          [language === 'ar' ? 'تقييم نفس القسم' : 'Same-Dept Score']: scores.sameDeptScore.toFixed(2),
          [language === 'ar' ? 'تقييم الأقسام الأخرى' : 'Cross-Dept Score']: scores.crossDeptScore.toFixed(2),
          [language === 'ar' ? 'الأداء' : 'Performance']: scores.performance.toFixed(2),
          [language === 'ar' ? 'العمل الجماعي' : 'Teamwork']: scores.teamwork.toFixed(2),
          [language === 'ar' ? 'حجم العمل' : 'Workload']: scores.workload?.toFixed(2) || '—',
        },
      },
      {
        header: language === 'ar' ? 'اتجاه الأداء (12 شهر)' : 'Performance Trend (12 Months)',
        type: 'table',
        data: trendData.map((item) => ({
          [language === 'ar' ? 'الشهر' : 'Month']: item.month,
          [language === 'ar' ? 'نفس القسم' : 'Same Dept']: item.sameDept.toFixed(2),
          [language === 'ar' ? 'قسم آخر' : 'Cross Dept']: item.crossDept.toFixed(2),
        })),
      },
    ],
  };

  if (format === 'pdf') {
    exportToPDF(data, language);
  } else {
    exportToExcel(data, language);
  }
};

// Department Dashboard Export
export const exportDepartmentDashboard = (
  department: { nameEn: string; nameAr: string; avgSameDept: number; avgCrossDept: number; participation: number; employeeCount: number },
  employeeData: { nameEn: string; nameAr: string; performance: number; teamwork: number; workload?: number }[],
  trendData: { month: string; sameDept: number; crossDept: number }[],
  language: 'en' | 'ar' = 'en',
  format: 'pdf' | 'excel' = 'pdf'
) => {
  const data: ExportData = {
    title: language === 'ar' ? 'تقرير القسم' : 'Department Report',
    subtitle: language === 'ar' ? department.nameAr : department.nameEn,
    date: new Date().toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US'),
    sections: [
      {
        header: language === 'ar' ? 'ملخص القسم' : 'Department Summary',
        type: 'kpi',
        data: {
          [language === 'ar' ? 'متوسط نفس القسم' : 'Avg Same-Dept']: department.avgSameDept.toFixed(2),
          [language === 'ar' ? 'متوسط الأقسام الأخرى' : 'Avg Cross-Dept']: department.avgCrossDept.toFixed(2),
          [language === 'ar' ? 'نسبة المشاركة' : 'Participation']: `${department.participation}%`,
          [language === 'ar' ? 'عدد الموظفين' : 'Employee Count']: department.employeeCount,
        },
      },
      {
        header: language === 'ar' ? 'درجات الموظفين' : 'Employee Scores',
        type: 'table',
        data: employeeData.map((emp) => ({
          [language === 'ar' ? 'الموظف' : 'Employee']: language === 'ar' ? emp.nameAr : emp.nameEn,
          [language === 'ar' ? 'الأداء' : 'Performance']: emp.performance.toFixed(2),
          [language === 'ar' ? 'العمل الجماعي' : 'Teamwork']: emp.teamwork.toFixed(2),
          [language === 'ar' ? 'حجم العمل' : 'Workload']: emp.workload?.toFixed(2) || '—',
        })),
      },
      {
        header: language === 'ar' ? 'اتجاه الأداء' : 'Performance Trend',
        type: 'table',
        data: trendData.map((item) => ({
          [language === 'ar' ? 'الشهر' : 'Month']: item.month,
          [language === 'ar' ? 'نفس القسم' : 'Same Dept']: item.sameDept.toFixed(2),
          [language === 'ar' ? 'قسم آخر' : 'Cross Dept']: item.crossDept.toFixed(2),
        })),
      },
    ],
  };

  if (format === 'pdf') {
    exportToPDF(data, language);
  } else {
    exportToExcel(data, language);
  }
};

// Company Dashboard Export
export const exportCompanyDashboard = (
  metrics: { avgSameDept: number; avgCrossDept: number; participation: number; volatility: number; totalEmployees: number; totalEvaluations: number },
  departmentData: { nameEn: string; nameAr: string; avgSameDept: number; avgCrossDept: number; participation: number }[],
  trendData: { month: string; sameDept: number; crossDept: number }[],
  language: 'en' | 'ar' = 'en',
  format: 'pdf' | 'excel' = 'pdf'
) => {
  const data: ExportData = {
    title: language === 'ar' ? 'تقرير الشركة' : 'Company Report',
    subtitle: language === 'ar' ? 'تحليل الأداء على مستوى الشركة' : 'Company-wide Performance Analysis',
    date: new Date().toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US'),
    sections: [
      {
        header: language === 'ar' ? 'ملخص الشركة' : 'Company Summary',
        type: 'kpi',
        data: {
          [language === 'ar' ? 'إجمالي الموظفين' : 'Total Employees']: metrics.totalEmployees,
          [language === 'ar' ? 'إجمالي التقييمات' : 'Total Evaluations']: metrics.totalEvaluations,
          [language === 'ar' ? 'متوسط نفس القسم' : 'Avg Same-Dept']: metrics.avgSameDept.toFixed(2),
          [language === 'ar' ? 'متوسط الأقسام الأخرى' : 'Avg Cross-Dept']: metrics.avgCrossDept.toFixed(2),
          [language === 'ar' ? 'نسبة المشاركة' : 'Participation']: `${metrics.participation}%`,
          [language === 'ar' ? 'التقلب' : 'Volatility']: `${metrics.volatility}%`,
        },
      },
      {
        header: language === 'ar' ? 'مقارنة الأقسام' : 'Department Benchmark',
        type: 'table',
        data: departmentData.map((dept) => ({
          [language === 'ar' ? 'القسم' : 'Department']: language === 'ar' ? dept.nameAr : dept.nameEn,
          [language === 'ar' ? 'نفس القسم' : 'Same Dept']: dept.avgSameDept.toFixed(2),
          [language === 'ar' ? 'قسم آخر' : 'Cross Dept']: dept.avgCrossDept.toFixed(2),
          [language === 'ar' ? 'المشاركة' : 'Participation']: `${dept.participation}%`,
        })),
      },
      {
        header: language === 'ar' ? 'اتجاه الأداء' : 'Performance Trend',
        type: 'table',
        data: trendData.map((item) => ({
          [language === 'ar' ? 'الشهر' : 'Month']: item.month,
          [language === 'ar' ? 'نفس القسم' : 'Same Dept']: item.sameDept.toFixed(2),
          [language === 'ar' ? 'قسم آخر' : 'Cross Dept']: item.crossDept.toFixed(2),
        })),
      },
    ],
  };

  if (format === 'pdf') {
    exportToPDF(data, language);
  } else {
    exportToExcel(data, language);
  }
};
