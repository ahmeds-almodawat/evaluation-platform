import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type SavedFilter = {
  id: string;
  owner_user_id: string;
  name: string;
  params: any;
  is_shared: boolean;
  created_at: string;
};

export default function SavedFiltersBar({
  reportKey,
  buildParams,
  applyParams,
  canShare,
}: {
  reportKey: string;
  buildParams: () => any;
  applyParams: (params: any) => void;
  canShare: boolean;
}) {
  const [filters, setFilters] = useState<SavedFilter[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.rpc("rpc_filters_list", { p_report_key: reportKey });
    if (error) {
      console.warn("Saved filters load failed:", error);
      setFilters([]);
      return;
    }
    setFilters((data as any) || []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onApply = () => {
    const f = filters.find((x) => x.id === selectedId);
    if (f) applyParams(f.params);
  };

  const onSaveAs = async () => {
    const name = window.prompt("Filter name?");
    if (!name) return;
    setSaving(true);
    try {
      const params = buildParams();
      const { error } = await supabase.rpc("rpc_filters_save", {
        p_id: null,
        p_report_key: reportKey,
        p_name: name,
        p_params: params,
        p_is_shared: false,
      });
      if (error) throw error;
      await load();
    } catch (e) {
      console.error("Save filter failed:", e);
      alert("Failed to save filter.");
    } finally {
      setSaving(false);
    }
  };

  const onSave = async () => {
    if (!selectedId) return onSaveAs();
    setSaving(true);
    try {
      const params = buildParams();
      const current = filters.find((x) => x.id === selectedId);
      const { error } = await supabase.rpc("rpc_filters_save", {
        p_id: selectedId,
        p_report_key: reportKey,
        p_name: current?.name || "Saved Filter",
        p_params: params,
        p_is_shared: canShare ? !!current?.is_shared : false,
      });
      if (error) throw error;
      await load();
    } catch (e) {
      console.error("Update filter failed:", e);
      alert("Failed to update filter.");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!selectedId) return;
    if (!window.confirm("Delete this saved filter?")) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("rpc_filters_delete", { p_id: selectedId });
      if (error) throw error;
      setSelectedId("");
      await load();
    } catch (e) {
      console.error("Delete filter failed:", e);
      alert("Failed to delete filter.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-4 flex flex-col md:flex-row gap-3 items-start md:items-center">
        <div className="w-full md:w-80">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger>
              <SelectValue placeholder="Saved filters" />
            </SelectTrigger>
            <SelectContent>
              {filters.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                  {f.is_shared ? " (Shared)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" onClick={onApply} disabled={!selectedId}>
            Apply
          </Button>
          <Button onClick={onSave} disabled={saving}>
            Save
          </Button>
          <Button variant="outline" onClick={onSaveAs} disabled={saving}>
            Save as
          </Button>
          <Button variant="destructive" onClick={onDelete} disabled={!selectedId || saving}>
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
