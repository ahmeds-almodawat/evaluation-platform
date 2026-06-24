import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useLanguage } from "@/contexts/LanguageContext";
import { BarChart3, Download, LayoutDashboard, Settings, Shield, Users } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const CommandPalette: React.FC<Props> = ({ open, onOpenChange }) => {
  const navigate = useNavigate();
  const { language } = useLanguage();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={language === "ar" ? "ابحث أو نفّذ أمر..." : "Search or run a command..."} />
      <CommandList>
        <CommandEmpty>{language === "ar" ? "لا توجد نتائج" : "No results found."}</CommandEmpty>

        <CommandGroup heading={language === "ar" ? "التنقل" : "Navigation"}>
          <CommandItem onSelect={() => go("/")}> 
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <span>{language === "ar" ? "الصفحة الرئيسية" : "Home"}</span>
          </CommandItem>
          <CommandItem onSelect={() => go("/executive-dashboards")}> 
            <BarChart3 className="mr-2 h-4 w-4" />
            <span>{language === "ar" ? "لوحات المدير" : "Executive Dashboards"}</span>
          </CommandItem>
          <CommandItem onSelect={() => go("/users")}> 
            <Users className="mr-2 h-4 w-4" />
            <span>{language === "ar" ? "الموظفون" : "Employees"}</span>
          </CommandItem>
          <CommandItem onSelect={() => go("/settings")}> 
            <Settings className="mr-2 h-4 w-4" />
            <span>{language === "ar" ? "الإعدادات" : "Settings"}</span>
          </CommandItem>
          <CommandItem onSelect={() => go("/settings/permissions")}> 
            <Shield className="mr-2 h-4 w-4" />
            <span>{language === "ar" ? "الصلاحيات" : "Permissions"}</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading={language === "ar" ? "إجراءات" : "Actions"}>
          <CommandItem onSelect={() => go("/settings/export")}> 
            <Download className="mr-2 h-4 w-4" />
            <span>{language === "ar" ? "مركز التصدير" : "Export Center"}</span>
            <CommandShortcut>{language === "ar" ? "اذهب" : "Go"}</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};

export default CommandPalette;
