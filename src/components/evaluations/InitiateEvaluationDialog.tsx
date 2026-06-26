import React, { useState, useEffect, useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  Building2,
  Users,
  Send,
  ArrowLeftRight,
  UserCheck,
  ShieldCheck,
  AlertTriangle,
  Gauge,
} from "lucide-react";

interface Department {
  id: string;
  name_en: string;
  name_ar: string;
}

interface EvalTemplate {
  id: string;
  name: string;
  scale_max: number;
  labels: unknown;
}

interface OrgUnit {
  id: string;
  department_id: string;
  name_en: string;
  name_ar: string;
  is_active: boolean;
}

interface MemberProfile {
  id: string;
  name_en?: string | null;
  name_ar?: string | null;
  email?: string | null;
  department_id?: string | null;
  unit_id?: string | null;
  position?: string | null;
  is_active?: boolean | null;
  deleted_at?: string | null;
}

interface ManagerAssignment {
  id: string;
  manager_id: string;
  department_id: string;
  unit_id: string | null;
  assignment_scope: "department" | "unit";
  is_active: boolean;
}

type CampaignType =
  | "self_station"
  | "cross_station"
  | "cross_department"
  | "manager_to_team"
  | "team_to_manager"
  | "manager_to_supervisors";

type CrossStationDirection =
  | "selected_to_main"
  | "main_to_selected"
  | "bidirectional";

interface InitiateEvaluationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * New explicit structure:
   * - self_station: peers evaluate peers inside the same unit/station; falls back to department only when no units exist.
   * - cross_station: selected station(s) evaluate a main station, the main station evaluates selected station(s), or both.
   * - cross_department: department members evaluate members in linked departments.
   * - manager_to_team: assigned supervisor/manager evaluates employees under the assigned department/unit scope.
   * - team_to_manager: employees under an assigned scope evaluate their supervisor/manager.
   * - manager_to_supervisors: department manager evaluates unit/station supervisors in their department.
   *
   * Legacy aliases are still accepted internally for old callers, but creation UI should not expose them.
   */
  type: CampaignType | "self" | "cross_managers" | "cross_individuals";
}

const db = supabase as any;

type EvaluationScope =
  | "department_peer"
  | "unit_peer"
  | "manager_department"
  | "manager_unit"
  | "manager_to_supervisor_dept"
  | "manager_to_supervisor_unit"
  | "cross_department"
  | "cross_unit"
  | "team_to_manager_department"
  | "team_to_manager_unit";

interface AssignmentDraft {
  evaluator: MemberProfile;
  evaluatee: MemberProfile;
  evaluationType: CampaignType;
  evaluationScope: EvaluationScope;
  managerAssignmentId?: string | null;
}

interface CampaignPreviewBreakdown {
  key: string;
  labelEn: string;
  labelAr: string;
  evaluatorCount: number;
  evaluateeCount: number;
  totalAssignments: number;
  warnings: string[];
}

interface CampaignPreview {
  key: string;
  evaluatorCount: number;
  evaluateeCount: number;
  totalAssignments: number;
  maxAssignmentsForOneEvaluator: number;
  maxPerEvaluator: number | null;
  strategy: "all_assigned" | "capped_per_evaluator";
  warnings: string[];
  breakdowns: CampaignPreviewBreakdown[];
  requiresTypedConfirmation: boolean;
  blockReason?: string | null;
}

const DEFAULT_MAX_PER_EVALUATOR: Record<CampaignType, number | null> = {
  self_station: 5,
  cross_station: 5,
  cross_department: 5,
  manager_to_team: null,
  team_to_manager: null,
  manager_to_supervisors: null,
};

const SOFT_ASSIGNMENT_WARNING_THRESHOLD = 500;
const TYPED_CONFIRMATION_THRESHOLD = 2000;
const HARD_ASSIGNMENT_BLOCK_THRESHOLD = 5000;
const HIGH_VOLUME_CONFIRM_PHRASE = "CREATE";
const INSERT_BATCH_SIZE = 500;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function capTargetsForEvaluator(
  evaluator: MemberProfile,
  candidates: MemberProfile[],
  maxPerEvaluator: number | null,
  seed: string,
): MemberProfile[] {
  if (!maxPerEvaluator || candidates.length <= maxPerEvaluator)
    return candidates;
  return [...candidates]
    .sort(
      (a, b) =>
        stableHash(`${seed}:${evaluator.id}:${a.id}`) -
        stableHash(`${seed}:${evaluator.id}:${b.id}`),
    )
    .slice(0, maxPerEvaluator);
}

function summarizeAssignments(
  assignments: AssignmentDraft[],
  maxPerEvaluator: number | null,
  key: string,
  breakdowns: CampaignPreviewBreakdown[] = [],
  extraWarnings: string[] = [],
): CampaignPreview {
  const evaluatorIds = new Set(assignments.map((item) => item.evaluator.id));
  const evaluateeIds = new Set(assignments.map((item) => item.evaluatee.id));
  const counts = new Map<string, number>();

  assignments.forEach((item) => {
    counts.set(item.evaluator.id, (counts.get(item.evaluator.id) || 0) + 1);
  });

  const maxAssignmentsForOneEvaluator = counts.size
    ? Math.max(...counts.values())
    : 0;
  const warnings: string[] = [...extraWarnings];

  if (assignments.length >= SOFT_ASSIGNMENT_WARNING_THRESHOLD) {
    warnings.push(
      "Large campaign: confirm that this volume is intended before sending.",
    );
  }

  if (assignments.length >= TYPED_CONFIRMATION_THRESHOLD) {
    warnings.push(
      `High-volume campaign: type ${HIGH_VOLUME_CONFIRM_PHRASE} to confirm creation.`,
    );
  }

  if (maxAssignmentsForOneEvaluator > 20) {
    warnings.push(
      "Some evaluators will receive more than 20 forms. Consider lowering the cap to reduce survey fatigue.",
    );
  }

  return {
    key,
    evaluatorCount: evaluatorIds.size,
    evaluateeCount: evaluateeIds.size,
    totalAssignments: assignments.length,
    maxAssignmentsForOneEvaluator,
    maxPerEvaluator,
    strategy: maxPerEvaluator ? "capped_per_evaluator" : "all_assigned",
    warnings,
    breakdowns,
    requiresTypedConfirmation: assignments.length >= TYPED_CONFIRMATION_THRESHOLD,
    blockReason:
      assignments.length > HARD_ASSIGNMENT_BLOCK_THRESHOLD
        ? `This campaign would create more than ${HARD_ASSIGNMENT_BLOCK_THRESHOLD} forms. Reduce the scope or cap.`
        : null,
  };
}

const normalizeCampaignType = (
  type: InitiateEvaluationDialogProps["type"],
): CampaignType => {
  if (type === "self") return "self_station";
  if (type === "cross_managers" || type === "cross_individuals")
    return "cross_department";
  return type;
};

const InitiateEvaluationDialog: React.FC<InitiateEvaluationDialogProps> = ({
  open,
  onOpenChange,
  type,
}) => {
  const { language } = useLanguage();
  const { toast } = useToast();
  const campaignType = normalizeCampaignType(type);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [units, setUnits] = useState<OrgUnit[]>([]);
  const [selectedSourceUnit, setSelectedSourceUnit] = useState("");
  const [selectedTargetUnit, setSelectedTargetUnit] = useState("");
  const [selectedBatchStationIds, setSelectedBatchStationIds] = useState<string[]>([]);
  const [crossStationDirection, setCrossStationDirection] =
    useState<CrossStationDirection>("selected_to_main");
  const [selfStationMode, setSelfStationMode] = useState<"all" | "specific">("all");
  const [templates, setTemplates] = useState<EvalTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<CampaignPreview | null>(null);
  const [highVolumeConfirmText, setHighVolumeConfirmText] = useState("");
  const [maxPerEvaluatorInput, setMaxPerEvaluatorInput] = useState<string>(() =>
    String(DEFAULT_MAX_PER_EVALUATOR["self_station"] ?? ""),
  );

  const copy = useMemo(() => {
    const map: Record<
      CampaignType,
      {
        titleEn: string;
        titleAr: string;
        descriptionEn: string;
        descriptionAr: string;
        icon: React.ReactNode;
      }
    > = {
      self_station: {
        titleEn: "Self Station / Unit Evaluation",
        titleAr: "تقييم داخلي للوحدة / المحطة",
        descriptionEn:
          "Peers evaluate peers inside the same station/unit. If the department has no units, the evaluation falls back to the whole department.",
        descriptionAr:
          "يقيم أعضاء نفس الوحدة / المحطة بعضهم. إذا لم توجد وحدات في القسم، يتم استخدام كامل القسم.",
        icon: <Users className="w-5 h-5 text-primary" />,
      },
      cross_station: {
        titleEn: "Multi-Station Cross Evaluation",
        titleAr: "تقييم بين الوحدات / المحطات",
        descriptionEn:
          "Create Cross Station Batch pairings between one main station and multiple selected stations inside the same department.",
        descriptionAr:
          "تقوم وحدة / محطة مختارة بتقييم وحدة / محطة أخرى داخل نفس القسم.",
        icon: <ArrowLeftRight className="w-5 h-5 text-primary" />,
      },
      cross_department: {
        titleEn: "Cross Department Evaluation",
        titleAr: "تقييم بين الأقسام",
        descriptionEn:
          "Members of the selected department evaluate members in linked departments. Department links must be configured first.",
        descriptionAr:
          "يقيم أعضاء القسم المختار أعضاء الأقسام المرتبطة. يجب إعداد ربط الأقسام أولاً.",
        icon: <Building2 className="w-5 h-5 text-primary" />,
      },
      manager_to_team: {
        titleEn: "Manager Evaluates Team",
        titleAr: "تقييم المدير لأعضاء الفريق",
        descriptionEn:
          "Managers evaluate employees under their active department/unit assignments.",
        descriptionAr:
          "يقيم المدراء الموظفين ضمن تعيينات القسم / الوحدة النشطة الخاصة بهم.",
        icon: <UserCheck className="w-5 h-5 text-primary" />,
      },
      team_to_manager: {
        titleEn: "Team Evaluates Manager",
        titleAr: "تقييم أعضاء الفريق للمدير",
        descriptionEn:
          "Employees under an active manager assignment evaluate that manager. This is stored separately from peer evaluation.",
        descriptionAr:
          "يقيم الموظفون ضمن تعيين مدير نشط ذلك المدير. يتم حفظ هذا النوع منفصلاً عن تقييم الزملاء.",
        icon: <ShieldCheck className="w-5 h-5 text-primary" />,
      },
      manager_to_supervisors: {
        titleEn: "Manager Evaluates Supervisors",
        titleAr: "تقييم المدير للمشرفين",
        descriptionEn:
          "Department managers evaluate active unit/station supervisors in their department.",
        descriptionAr:
          "يقيم مديرو الأقسام مشرفي الوحدات / المحطات النشطين داخل القسم.",
        icon: <UserCheck className="w-5 h-5 text-primary" />,
      },
    };

    return map[campaignType];
  }, [campaignType]);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const selectedDept = departments.find((d) => d.id === selectedDepartment);
  const selectableCrossStationUnits = useMemo(
    () =>
      selectedTargetUnit
        ? units.filter((unit) => unit.id !== selectedTargetUnit)
        : [],
    [selectedTargetUnit, units],
  );
  const selectedBatchStationIdSet = useMemo(
    () => new Set(selectableCrossStationUnits.map((unit) => unit.id)),
    [selectableCrossStationUnits],
  );
  const selectedCrossStationIds = useMemo(
    () =>
      selectedBatchStationIds.filter((id) => selectedBatchStationIdSet.has(id)),
    [selectedBatchStationIdSet, selectedBatchStationIds],
  );
  const selectedCrossStationUnits = useMemo(
    () =>
      selectedCrossStationIds
        .map((id) => units.find((unit) => unit.id === id))
        .filter((unit): unit is OrgUnit => Boolean(unit)),
    [selectedCrossStationIds, units],
  );
  const selectedCrossStationKey = selectedCrossStationIds.slice().sort().join(",");
  const maxPerEvaluatorApplies =
    campaignType === "self_station" ||
    campaignType === "cross_station" ||
    campaignType === "cross_department";
  const parsedMaxPerEvaluator = maxPerEvaluatorApplies
    ? Math.max(
        1,
        Math.min(
          1000,
          Number(
            maxPerEvaluatorInput ||
              DEFAULT_MAX_PER_EVALUATOR[campaignType] ||
              5,
          ),
        ),
      )
    : null;
  const previewKey = [
    campaignType,
    selectedDepartment,
    selectedSourceUnit,
    selectedTargetUnit,
    selectedCrossStationKey,
    crossStationDirection,
    selfStationMode,
    selectedTemplateId,
    parsedMaxPerEvaluator,
    currentMonth,
  ].join("__");

  useEffect(() => {
    setMaxPerEvaluatorInput(
      DEFAULT_MAX_PER_EVALUATOR[campaignType]
        ? String(DEFAULT_MAX_PER_EVALUATOR[campaignType])
        : "",
    );
    setSelectedBatchStationIds([]);
    setCrossStationDirection("selected_to_main");
    setPreview(null);
  }, [campaignType, open]);

  useEffect(() => {
    setPreview(null);
    setHighVolumeConfirmText("");
  }, [previewKey]);

  useEffect(() => {
    if (open) {
      fetchDepartments();
      fetchTemplates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    setSelectedSourceUnit("");
    setSelectedTargetUnit("");
    setSelectedBatchStationIds([]);
    setCrossStationDirection("selected_to_main");
    setSelfStationMode("all");
    if (open && selectedDepartment) {
      fetchUnits(selectedDepartment);
    } else {
      setUnits([]);
    }
  }, [open, selectedDepartment]);

  useEffect(() => {
    setSelectedBatchStationIds((current) =>
      current.filter((id) => id !== selectedTargetUnit && units.some((unit) => unit.id === id)),
    );
  }, [selectedTargetUnit, units]);

  const fetchDepartments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name_en, name_ar")
        .order("name_en");

      if (error) throw error;
      setDepartments(data || []);
    } catch (error) {
      console.error("Error fetching departments:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnits = async (departmentId: string) => {
    setLoadingUnits(true);
    try {
      const { data, error } = await db
        .from("org_units")
        .select("id, department_id, name_en, name_ar, is_active")
        .eq("department_id", departmentId)
        .eq("is_active", true)
        .order("name_en");

      if (error && error.code !== "42P01") throw error;
      setUnits((data || []) as OrgUnit[]);
    } catch (error) {
      console.error("Error fetching units:", error);
      setUnits([]);
    } finally {
      setLoadingUnits(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from("evaluation_templates")
        .select("id,name,scale_max,labels,status")
        .eq("status", "published")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      setTemplates((data || []) as EvalTemplate[]);
      if (!selectedTemplateId && (data || []).length) {
        setSelectedTemplateId((data || [])[0].id);
      }
    } catch (error) {
      console.error("Error fetching templates:", error);
      setTemplates([]);
    }
  };

  const loadTemplateSnapshot = async () => {
    const { data: tpl, error: tplErr } = await supabase
      .from("evaluation_templates")
      .select("id,name,scale_max,labels")
      .eq("id", selectedTemplateId)
      .maybeSingle();
    if (tplErr) throw tplErr;
    if (!tpl)
      throw new Error(
        language === "ar" ? "القالب غير موجود" : "Template not found",
      );

    const { data: tplQs, error: qErr } = await supabase
      .from("evaluation_template_questions")
      .select("id,sort_order,text_en,text_ar,required,question_type,max_chars")
      .eq("template_id", selectedTemplateId)
      .order("sort_order", { ascending: true });
    if (qErr) throw qErr;

    const templateSnapshot = {
      template_id: tpl.id,
      name: tpl.name,
      scale_max: tpl.scale_max,
      labels: tpl.labels,
      questions: (tplQs || []).map((q: any) => ({
        id: q.id,
        sort_order: q.sort_order,
        text_en: q.text_en,
        text_ar: q.text_ar,
        required: q.required,
        question_type: q.question_type || "scale",
        max_chars: q.max_chars ?? null,
      })),
    };

    return { tpl, templateSnapshot };
  };

  const createBaseEvaluation = ({
    evaluator,
    evaluatee,
    currentMonth,
    tpl,
    templateSnapshot,
    evaluationType,
    evaluationScope,
    managerAssignmentId,
    campaignId,
    assignmentStrategy,
  }: {
    evaluator: MemberProfile;
    evaluatee: MemberProfile;
    currentMonth: string;
    tpl: any;
    templateSnapshot: unknown;
    evaluationType: string;
    evaluationScope: EvaluationScope;
    managerAssignmentId?: string | null;
    campaignId?: string | null;
    assignmentStrategy?: string | null;
  }) => ({
    evaluator_id: evaluator.id,
    evaluatee_id: evaluatee.id,
    evaluation_type: evaluationType,
    evaluation_scope: evaluationScope,
    evaluator_unit_id: evaluator.unit_id ?? null,
    evaluatee_unit_id: evaluatee.unit_id ?? null,
    manager_assignment_id: managerAssignmentId ?? null,
    campaign_id: campaignId ?? null,
    assignment_strategy: assignmentStrategy ?? null,
    period: currentMonth,
    status: "pending",
    performance_score: 0,
    teamwork_score: 0,
    scale_max: tpl.scale_max,
    template_id: tpl.id,
    labels_snapshot: tpl.labels,
    template_snapshot: templateSnapshot,
  });

  const fetchDepartmentData = async (departmentId: string) => {
    const [
      { data: membersData, error: membersError },
      { data: unitsData, error: unitsError },
      { data: assignmentsData, error: assignmentsError },
    ] = await Promise.all([
      db
        .from("profiles")
        .select("id, name_en, name_ar, email, department_id, unit_id, position, is_active, deleted_at")
        .eq("department_id", departmentId)
        .eq("is_active", true)
        .is("deleted_at", null),
      db
        .from("org_units")
        .select("id, department_id, name_en, name_ar, is_active")
        .eq("department_id", departmentId)
        .eq("is_active", true),
      db
        .from("manager_unit_assignments")
        .select(
          "id, manager_id, department_id, unit_id, assignment_scope, is_active",
        )
        .eq("department_id", departmentId)
        .eq("is_active", true),
    ]);

    if (membersError) throw membersError;
    if (unitsError && unitsError.code !== "42P01") throw unitsError;
    if (assignmentsError && assignmentsError.code !== "42P01")
      throw assignmentsError;

    const members: MemberProfile[] = membersData || [];
    const departmentUnits: OrgUnit[] = unitsData || [];
    const assignments: ManagerAssignment[] = assignmentsData || [];
    const assignedManagerIds = new Set(assignments.map((a) => a.manager_id));
    const managerProfiles = new Map<string, MemberProfile>();

    members.forEach((m) => managerProfiles.set(m.id, m));

    const missingManagerIds = [...assignedManagerIds].filter(
      (id) => !managerProfiles.has(id),
    );
    if (missingManagerIds.length > 0) {
      const { data: externalManagers, error: externalManagerError } = await db
        .from("profiles")
        .select("id, name_en, name_ar, email, department_id, unit_id, position, is_active, deleted_at")
        .in("id", missingManagerIds)
        .eq("is_active", true)
        .is("deleted_at", null);
      if (externalManagerError) throw externalManagerError;
      (externalManagers || []).forEach((m: MemberProfile) =>
        managerProfiles.set(m.id, m),
      );
    }

    return {
      members,
      departmentUnits,
      assignments,
      assignedManagerIds,
      managerProfiles,
    };
  };

  const validateSelections = () => {
    if (!selectedDepartment) {
      toast({
        title: language === "ar" ? "خطأ" : "Error",
        description:
          language === "ar"
            ? "يرجى اختيار القسم"
            : "Please select a department",
        variant: "destructive",
      });
      return false;
    }

    if (!selectedTemplateId) {
      toast({
        title: language === "ar" ? "خطأ" : "Error",
        description:
          language === "ar"
            ? "يرجى اختيار قالب تقييم"
            : "Please select an evaluation template",
        variant: "destructive",
      });
      return false;
    }

    if (campaignType === "self_station" && selfStationMode === "specific" && !selectedSourceUnit) {
      toast({
        title: language === "ar" ? "اختر الوحدة" : "Select a unit",
        description:
          language === "ar"
            ? "يرجى اختيار الوحدة/المحطة عند تشغيل تقييم محطة محددة."
            : "Please choose a unit/station when running a specific-station self evaluation.",
        variant: "destructive",
      });
      return false;
    }

    if (campaignType === "cross_station") {
      if (!selectedTargetUnit || selectedCrossStationIds.length === 0) {
        toast({
          title: language === "ar" ? "اختر الوحدات" : "Select units",
          description:
            language === "ar"
              ? "يرجى اختيار الوحدة المقيِّمة والوحدة المستهدفة."
              : "Please select a main station and at least one evaluating station.",
          variant: "destructive",
        });
        return false;
      }
      if (selectedCrossStationIds.includes(selectedTargetUnit)) {
        toast({
          title: language === "ar" ? "اختيار غير صحيح" : "Invalid selection",
          description:
            language === "ar"
              ? "لا يمكن أن تكون الوحدة المقيِّمة والمستهدفة نفس الوحدة."
              : "The main station is automatically excluded from the evaluating station list.",
          variant: "destructive",
        });
        return false;
      }
    }

    return true;
  };

  const buildAssignments = async (): Promise<AssignmentDraft[]> => {
    const assignmentsByPair = new Map<string, AssignmentDraft>();
    const addAssignment = (assignment: AssignmentDraft) => {
      const key = `${assignment.evaluationType}__${assignment.evaluator.id}__${assignment.evaluatee.id}__${assignment.managerAssignmentId || "none"}`;
      if (!assignmentsByPair.has(key)) assignmentsByPair.set(key, assignment);
    };

    if (campaignType === "cross_department") {
      const { data: links, error: linksError } = await supabase
        .from("department_links")
        .select("source_department_id, target_department_id")
        .or(
          `source_department_id.eq.${selectedDepartment},target_department_id.eq.${selectedDepartment}`,
        );

      if (linksError) throw linksError;

      if (!links || links.length === 0) {
        throw new Error(
          language === "ar"
            ? "هذا القسم ليس مرتبطًا بأي قسم آخر. يرجى ربط الأقسام أولاً."
            : "This department is not linked to any other department. Please link departments first.",
        );
      }

      const linkedDeptIds = links.map((link) =>
        link.source_department_id === selectedDepartment
          ? link.target_department_id
          : link.source_department_id,
      );

      const { data: evaluatorsRaw, error: evaluatorsError } = await db
        .from("profiles")
        .select("id, name_en, name_ar, email, department_id, unit_id, position, is_active, deleted_at")
        .eq("department_id", selectedDepartment)
        .eq("is_active", true)
        .is("deleted_at", null);

      if (evaluatorsError) throw evaluatorsError;

      const { data: evaluateesRaw, error: evaluateesError } = await db
        .from("profiles")
        .select("id, name_en, name_ar, email, department_id, unit_id, position, is_active, deleted_at")
        .in("department_id", linkedDeptIds)
        .eq("is_active", true)
        .is("deleted_at", null);

      if (evaluateesError) throw evaluateesError;

      const evaluators: MemberProfile[] = evaluatorsRaw || [];
      const evaluatees: MemberProfile[] = evaluateesRaw || [];
      const seed = `${currentMonth}:${campaignType}:${selectedDepartment}:cross_department`;

      for (const evaluator of evaluators) {
        const cappedEvaluatees = capTargetsForEvaluator(
          evaluator,
          evaluatees.filter((evaluatee) => evaluator.id !== evaluatee.id),
          parsedMaxPerEvaluator,
          seed,
        );
        for (const evaluatee of cappedEvaluatees) {
          addAssignment({
            evaluator,
            evaluatee,
            evaluationType: "cross_department",
            evaluationScope: "cross_department",
          });
        }
      }
    } else {
      const {
        members,
        departmentUnits,
        assignments,
        assignedManagerIds,
        managerProfiles,
      } = await fetchDepartmentData(selectedDepartment);
      const departmentHasUnits = departmentUnits.length > 0;
      const nonManagerMembers = members.filter(
        (m) => !assignedManagerIds.has(m.id),
      );

      if (
        members.length < 2 &&
        campaignType !== "manager_to_team" &&
        campaignType !== "team_to_manager"
      ) {
        throw new Error(
          language === "ar"
            ? "يجب أن يكون هناك عضوان على الأقل في القسم لإنشاء هذا التقييم."
            : "There must be at least 2 members in the department to create this evaluation.",
        );
      }

      if (campaignType === "self_station") {
        const seed = `${currentMonth}:${campaignType}:${selectedDepartment}:self_station:${selfStationMode}:${selectedSourceUnit || "all"}`;
        const eligiblePeerMembers = departmentHasUnits
          ? nonManagerMembers.filter(
              (member) =>
                !!member.unit_id &&
                (selfStationMode !== "specific" || member.unit_id === selectedSourceUnit),
            )
          : nonManagerMembers;

        for (const evaluator of eligiblePeerMembers) {
          const peerPool = departmentHasUnits
            ? eligiblePeerMembers.filter(
                (candidate) =>
                  candidate.unit_id === evaluator.unit_id &&
                  candidate.id !== evaluator.id,
              )
            : eligiblePeerMembers.filter(
                (candidate) => candidate.id !== evaluator.id,
              );
          const cappedPeers = capTargetsForEvaluator(
            evaluator,
            peerPool,
            parsedMaxPerEvaluator,
            seed,
          );

          for (const evaluatee of cappedPeers) {
            addAssignment({
              evaluator,
              evaluatee,
              evaluationType: "self_station",
              evaluationScope:
                departmentHasUnits && evaluator.unit_id
                  ? "unit_peer"
                  : "department_peer",
            });
          }
        }
      }

      if (campaignType === "cross_station" && selectedCrossStationIds.length > 0) {
        const pairIds = new Map<string, { sourceUnitId: string; targetUnitId: string }>();
        const addPair = (sourceUnitId: string, targetUnitId: string) => {
          if (!sourceUnitId || !targetUnitId || sourceUnitId === targetUnitId) return;
          pairIds.set(`${sourceUnitId}:${targetUnitId}`, { sourceUnitId, targetUnitId });
        };

        for (const selectedUnitId of selectedCrossStationIds) {
          if (crossStationDirection === "selected_to_main" || crossStationDirection === "bidirectional") {
            addPair(selectedUnitId, selectedTargetUnit);
          }
          if (crossStationDirection === "main_to_selected" || crossStationDirection === "bidirectional") {
            addPair(selectedTargetUnit, selectedUnitId);
          }
        }

        const beforeCrossStationAssignments = assignmentsByPair.size;

        for (const pair of pairIds.values()) {
          const evaluators = nonManagerMembers.filter(
            (m) => m.unit_id === pair.sourceUnitId,
          );
          const evaluatees = nonManagerMembers.filter(
            (m) => m.unit_id === pair.targetUnitId,
          );

          if (evaluators.length === 0 || evaluatees.length === 0) {
            continue;
          }

          const seed = `${currentMonth}:${campaignType}:${selectedDepartment}:${pair.sourceUnitId}:${pair.targetUnitId}`;
          for (const evaluator of evaluators) {
            const cappedEvaluatees = capTargetsForEvaluator(
              evaluator,
              evaluatees.filter((evaluatee) => evaluator.id !== evaluatee.id),
              parsedMaxPerEvaluator,
              seed,
            );
            for (const evaluatee of cappedEvaluatees) {
              addAssignment({
                evaluator,
                evaluatee,
                evaluationType: "cross_station",
                evaluationScope: "cross_unit",
              });
            }
          }
        }

        if (assignmentsByPair.size === beforeCrossStationAssignments) {
          throw new Error(
            language === "ar"
              ? "ØªØ£ÙƒØ¯ Ø£Ù† Ø§Ù„Ù…Ø­Ø·Ø§Øª Ø§Ù„Ù…Ø®ØªØ§Ø±Ø© ØªØ­ØªÙˆÙŠ Ø¹Ù„Ù‰ Ù…ÙˆØ¸ÙÙŠÙ† Ù†Ø´Ø·ÙŠÙ†."
              : "No valid station pairings were found. Make sure the selected stations have active employees.",
          );
        }
      }

      if (campaignType === "cross_station" && selectedCrossStationIds.length === 0) {
        const evaluators = nonManagerMembers.filter(
          (m) => m.unit_id === selectedSourceUnit,
        );
        const evaluatees = nonManagerMembers.filter(
          (m) => m.unit_id === selectedTargetUnit,
        );

        if (evaluators.length === 0 || evaluatees.length === 0) {
          throw new Error(
            language === "ar"
              ? "تأكد أن الوحدة المقيِّمة والوحدة المستهدفة تحتويان على موظفين."
              : "Make sure both source and target units have employees assigned.",
          );
        }

        const seed = `${currentMonth}:${campaignType}:${selectedDepartment}:${selectedSourceUnit}:${selectedTargetUnit}`;
        for (const evaluator of evaluators) {
          const cappedEvaluatees = capTargetsForEvaluator(
            evaluator,
            evaluatees.filter((evaluatee) => evaluator.id !== evaluatee.id),
            parsedMaxPerEvaluator,
            seed,
          );
          for (const evaluatee of cappedEvaluatees) {
            addAssignment({
              evaluator,
              evaluatee,
              evaluationType: "cross_station",
              evaluationScope: "cross_unit",
            });
          }
        }
      }

      if (
        campaignType === "manager_to_team" ||
        campaignType === "team_to_manager"
      ) {
        if (assignments.length === 0) {
          throw new Error(
            language === "ar"
              ? "يرجى إعداد تعيينات المدراء للقسم أو الوحدات أولاً."
              : "Please configure manager assignments for the department or units first.",
          );
        }

        for (const assignment of assignments) {
          const manager = managerProfiles.get(assignment.manager_id);
          if (!manager) continue;

          const assignedEmployees =
            assignment.assignment_scope === "department"
              ? nonManagerMembers
              : nonManagerMembers.filter(
                  (m) => m.unit_id && m.unit_id === assignment.unit_id,
                );

          for (const employee of assignedEmployees) {
            if (manager.id === employee.id) continue;
            addAssignment({
              evaluator:
                campaignType === "manager_to_team" ? manager : employee,
              evaluatee:
                campaignType === "manager_to_team" ? employee : manager,
              evaluationType: campaignType,
              evaluationScope:
                campaignType === "manager_to_team"
                  ? assignment.assignment_scope === "department"
                    ? "manager_department"
                    : "manager_unit"
                  : assignment.assignment_scope === "department"
                    ? "team_to_manager_department"
                    : "team_to_manager_unit",
              managerAssignmentId: assignment.id,
            });
          }
        }
      }

      // --- Manager → Supervisors ---
      // Department-scoped managers evaluate unit-scoped supervisors in the same department.
      if (campaignType === "manager_to_supervisors") {
        // Collect unit-scoped supervisor assignments (supervisor = manager with assignment_scope='unit')
        const unitScopedAssignments = assignments.filter(
          (a) => a.assignment_scope === "unit",
        );
        if (unitScopedAssignments.length === 0) {
          throw new Error(
            language === "ar"
              ? "لا يوجد مشرفي وحدات/محطات معينين في هذا القسم."
              : "No unit/station supervisors are assigned in this department.",
          );
        }

        // Collect department-scoped manager assignments (manager = assignment_scope='department')
        const deptScopedManagers = assignments.filter(
          (a) => a.assignment_scope === "department",
        );

        if (deptScopedManagers.length === 0) {
          throw new Error(
            language === "ar"
              ? "لا يوجد مدير قسم معين. يرجى تعيين مدير للقسم أولاً."
              : "No department manager is assigned. Please assign a department manager first.",
          );
        }

        // Build a set of supervisor profile IDs from unit-scoped assignments
        const supervisorIds = new Set(
          unitScopedAssignments.map((a) => a.manager_id),
        );

        for (const deptManager of deptScopedManagers) {
          const mgrProfile = managerProfiles.get(deptManager.manager_id);
          if (!mgrProfile) continue;

          for (const supervisorId of supervisorIds) {
            if (mgrProfile.id === supervisorId) continue; // skip self-pair
            const supervisorProfile = managerProfiles.get(supervisorId);
            if (!supervisorProfile) continue;
            addAssignment({
              evaluator: mgrProfile,
              evaluatee: supervisorProfile,
              evaluationType: "manager_to_supervisors",
              evaluationScope: "manager_to_supervisor_dept",
              managerAssignmentId: deptManager.id,
            });
          }
        }
      }
    }

    return [...assignmentsByPair.values()];
  };

  function memberLabel(member?: MemberProfile | null) {
    if (!member) return language === "ar" ? "غير معروف" : "Unknown";
    return language === "ar" ? member.name_ar || member.name_en || member.email || member.id : member.name_en || member.name_ar || member.email || member.id;
  }

  function getUnitLabel(unitId?: string | null) {
    if (!unitId) {
      return { en: "Department fallback / no unit", ar: "القسم كامل / بدون وحدة" };
    }
    const unit = units.find((item) => item.id === unitId);
    return { en: unit?.name_en || unitId, ar: unit?.name_ar || unit?.name_en || unitId };
  }

  function buildPreviewBreakdowns(assignments: AssignmentDraft[]): CampaignPreviewBreakdown[] {
    const buckets = new Map<string, { labelEn: string; labelAr: string; items: AssignmentDraft[] }>();
    const add = (key: string, labelEn: string, labelAr: string, item: AssignmentDraft) => {
      const bucketKey =
        campaignType === "cross_station" && key === "cross_station"
          ? `cross_station:${item.evaluator.unit_id || "department"}:${item.evaluatee.unit_id || "department"}`
          : key;
      const current = buckets.get(bucketKey) || { labelEn, labelAr, items: [] };
      current.items.push(item);
      buckets.set(bucketKey, current);
    };

    for (const item of assignments) {
      if (campaignType === "self_station") {
        const label = getUnitLabel(item.evaluator.unit_id);
        add(`self:${item.evaluator.unit_id || "department"}`, label.en, label.ar, item);
      } else if (campaignType === "cross_station") {
        const source = getUnitLabel(item.evaluator.unit_id);
        const target = getUnitLabel(item.evaluatee.unit_id);
        add("cross_station", `${source.en} → ${target.en}`, `${source.ar} ← ${target.ar}`, item);
      } else if (campaignType === "manager_to_team") {
        const scope = getUnitLabel(item.evaluatee.unit_id);
        add(`manager_to_team:${item.managerAssignmentId || item.evaluator.id}:${item.evaluatee.unit_id || "department"}`, `${memberLabel(item.evaluator)} → ${scope.en}`, `${memberLabel(item.evaluator)} ← ${scope.ar}`, item);
      } else if (campaignType === "team_to_manager") {
        const scope = getUnitLabel(item.evaluator.unit_id);
        add(`team_to_manager:${item.managerAssignmentId || item.evaluatee.id}:${item.evaluator.unit_id || "department"}`, `${scope.en} → ${memberLabel(item.evaluatee)}`, `${scope.ar} ← ${memberLabel(item.evaluatee)}`, item);
      } else if (campaignType === "manager_to_supervisors") {
        add(`manager_to_supervisors:${item.evaluator.id}`, `${memberLabel(item.evaluator)} → Supervisors`, `${memberLabel(item.evaluator)} ← المشرفين`, item);
      } else {
        add("cross_department", "Cross Department", "تقييم بين الأقسام", item);
      }
    }

    return [...buckets.entries()].map(([key, bucket]) => {
      const evaluators = new Set(bucket.items.map((item) => item.evaluator.id));
      const evaluatees = new Set(bucket.items.map((item) => item.evaluatee.id));
      const warnings: string[] = [];
      if (campaignType === "self_station" && evaluators.size < 2) {
        warnings.push("This station has fewer than 2 eligible employees.");
      }
      return {
        key,
        labelEn: bucket.labelEn,
        labelAr: bucket.labelAr,
        evaluatorCount: evaluators.size,
        evaluateeCount: evaluatees.size,
        totalAssignments: bucket.items.length,
        warnings,
      };
    }).sort((a, b) => a.labelEn.localeCompare(b.labelEn));
  }

  function formatWarning(warning: string) {
    if (language !== "ar") return warning;
    if (warning === "Large campaign: confirm that this volume is intended before sending.") return "حملة كبيرة: تأكد أن هذا الحجم مقصود قبل الإرسال.";
    if (warning.startsWith("High-volume campaign")) return `حملة كبيرة جدًا: اكتب ${HIGH_VOLUME_CONFIRM_PHRASE} للتأكيد.`;
    if (warning === "Some evaluators will receive more than 20 forms. Consider lowering the cap to reduce survey fatigue.") return "بعض المقيّمين سيستلمون أكثر من 20 نموذجًا. فكر في تقليل الحد لتقليل إرهاق التقييم.";
    if (warning.includes("have no station/unit assigned")) return warning.replace("employee(s) are in this department but have no station/unit assigned. Station-based campaigns skip them.", "موظف/موظفين داخل هذا القسم بدون محطة/وحدة. حملات المحطة ستتخطاهم.");
    if (warning.includes("fewer than 2 eligible employees")) return warning.replace("station(s) have fewer than 2 eligible employees, so they cannot create peer evaluations.", "محطة/محطات لديها أقل من موظفين مؤهلين، لذلك لن تنشئ تقييم زملاء.");
    if (warning.includes("have no supervisor assignment")) return warning.replace("active station(s) have no supervisor assignment. Supervisor/Manager→Team and Team→Supervisor/Manager campaigns will not cover them.", "محطة/محطات نشطة بدون تعيين مشرف. حملات المشرف/المدير→الفريق والفريق→المشرف/المدير لن تغطيها.");
    if (warning.includes("have no manager assignment")) return warning.replace("active station(s) have no manager assignment. Supervisor/Manager→Team and Team→Supervisor/Manager campaigns will not cover them.", "محطة/محطات نشطة بدون تعيين مشرف. حملات المشرف/المدير→الفريق والفريق→المشرف/المدير لن تغطيها.");
    if (warning.includes("manager assignment(s) point to inactive")) return warning.replace("manager assignment(s) point to inactive or missing stations.", "تعيين/تعيينات مدير تشير إلى محطات معطلة أو غير موجودة.");
    return warning;
  }

  async function collectHealthWarningsForPreview(): Promise<string[]> {
    if (!selectedDepartment || campaignType === "cross_department") return [];
    const warnings: string[] = [];
    try {
      const { members, departmentUnits, assignments, assignedManagerIds } = await fetchDepartmentData(selectedDepartment);
      const activeUnitIds = new Set(departmentUnits.map((unit) => unit.id));
      const nonManagerMembers = members.filter((member) => !assignedManagerIds.has(member.id));

      const { data: profileStatusRows, error: profileStatusError } = await db
        .from("profiles")
        .select("id,is_active,deleted_at")
        .eq("department_id", selectedDepartment);
      if (!profileStatusError) {
        const excludedUsers = (profileStatusRows || []).filter(
          (profile: Pick<MemberProfile, "is_active" | "deleted_at">) =>
            profile.is_active === false || profile.deleted_at != null,
        ).length;
        if (excludedUsers > 0) {
          warnings.push(`${excludedUsers} archived/inactive user(s) were excluded from this preview.`);
        }
      }

      if (departmentUnits.length > 0) {
        const missingUnits = nonManagerMembers.filter((member) => !member.unit_id).length;
        if (missingUnits > 0) {
          warnings.push(`${missingUnits} employee(s) are in this department but have no station/unit assigned. Station-based campaigns skip them.`);
        }

        const targetUnits = selfStationMode === "specific" && selectedSourceUnit
          ? departmentUnits.filter((unit) => unit.id === selectedSourceUnit)
          : departmentUnits;

        if (campaignType === "self_station") {
          const shortStations = targetUnits.filter((unit) => nonManagerMembers.filter((member) => member.unit_id === unit.id).length < 2);
          if (shortStations.length > 0) {
            warnings.push(`${shortStations.length} station(s) have fewer than 2 eligible employees, so they cannot create peer evaluations.`);
          }
        }

        if (campaignType === "cross_station") {
          const selectedUnitIds = new Set([selectedTargetUnit, ...selectedCrossStationIds].filter(Boolean));
          const selectedUnitsWithoutActiveUsers = departmentUnits.filter(
            (unit) =>
              selectedUnitIds.has(unit.id) &&
              members.filter((member) => member.unit_id === unit.id).length === 0,
          );
          if (selectedUnitsWithoutActiveUsers.length > 0) {
            const labels = selectedUnitsWithoutActiveUsers
              .map((unit) => (language === "ar" ? unit.name_ar || unit.name_en : unit.name_en))
              .join(", ");
            warnings.push(`Selected station(s) with no active users: ${labels}.`);
          }

          const selectedUnitsWithoutEligibleUsers = departmentUnits.filter(
            (unit) =>
              selectedUnitIds.has(unit.id) &&
              members.filter((member) => member.unit_id === unit.id).length > 0 &&
              nonManagerMembers.filter((member) => member.unit_id === unit.id).length === 0,
          );
          if (selectedUnitsWithoutEligibleUsers.length > 0) {
            const labels = selectedUnitsWithoutEligibleUsers
              .map((unit) => (language === "ar" ? unit.name_ar || unit.name_en : unit.name_en))
              .join(", ");
            warnings.push(`Selected station(s) have active users, but no eligible non-manager evaluators/evaluatees: ${labels}.`);
          }
        }

        const hasDepartmentWideManager = assignments.some((assignment) => assignment.assignment_scope === "department");
        const assignedUnitIds = new Set(assignments.filter((assignment) => assignment.unit_id).map((assignment) => assignment.unit_id));
        const stationsWithoutManager = departmentUnits.filter((unit) => !hasDepartmentWideManager && !assignedUnitIds.has(unit.id)).length;
        if (stationsWithoutManager > 0) {
          warnings.push(`${stationsWithoutManager} active station(s) have no supervisor assignment. Supervisor/Manager→Team and Team→Supervisor/Manager campaigns will not cover them.`);
        }
      }

      // Specific warnings for manager_to_supervisors campaign
      if (campaignType === "manager_to_supervisors") {
        const hasDeptManager = assignments.some((a) => a.assignment_scope === "department");
        if (!hasDeptManager) {
          warnings.push("No department manager is assigned. Manager→Supervisors campaigns require a department-scoped manager.");
        }
        const unitScopedCount = assignments.filter((a) => a.assignment_scope === "unit").length;
        if (unitScopedCount === 0) {
          warnings.push("No unit/station supervisors are assigned. There are no supervisors for the department manager to evaluate.");
        }
      }

      const invalidManagerAssignments = assignments.filter((assignment) => assignment.unit_id && !activeUnitIds.has(assignment.unit_id)).length;
      if (invalidManagerAssignments > 0) {
        warnings.push(`${invalidManagerAssignments} manager assignment(s) point to inactive or missing stations.`);
      }
    } catch (error) {
      console.warn("Preview health warning check failed", error);
    }
    return warnings;
  }

  const handlePreview = async () => {
    if (!validateSelections()) return;
    setPreviewLoading(true);
    try {
      const assignments = await buildAssignments();
      if (assignments.length === 0) {
        toast({
          title:
            language === "ar"
              ? "لا توجد تعيينات مناسبة"
              : "No valid assignments",
          description:
            language === "ar"
              ? "لم يتم العثور على أي أزواج تقييم مناسبة. تحقق من توزيع الموظفين أو تعيينات المدراء."
              : "No valid evaluation pairs were found. Check employee allocation or manager assignments.",
          variant: "destructive",
        });
        setPreview(null);
        return;
      }

      const extraWarnings = await collectHealthWarningsForPreview();
      const breakdowns = buildPreviewBreakdowns(assignments);
      setPreview(
        summarizeAssignments(assignments, parsedMaxPerEvaluator, previewKey, breakdowns, extraWarnings),
      );
    } catch (error: any) {
      console.error("Error previewing evaluation campaign:", error);
      toast({
        title: language === "ar" ? "تعذر إنشاء المعاينة" : "Preview failed",
        description:
          error.message ||
          (language === "ar"
            ? "فشل حساب المعاينة"
            : "Failed to calculate preview"),
        variant: "destructive",
      });
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleProceed = async () => {
    if (!validateSelections()) return;

    if (!preview || preview.key !== previewKey) {
      toast({
        title: language === "ar" ? "المعاينة مطلوبة" : "Preview required",
        description:
          language === "ar"
            ? "يرجى حساب معاينة الحملة قبل الإنشاء حتى تتأكد من عدد التقييمات."
            : "Please preview the campaign before creating it so the assignment count is clear.",
        variant: "destructive",
      });
      return;
    }

    if (preview.blockReason) {
      toast({
        title: language === "ar" ? "تم حظر الحملة" : "Campaign blocked",
        description: language === "ar" ? `هذه الحملة تتجاوز ${HARD_ASSIGNMENT_BLOCK_THRESHOLD} نموذج. قلل النطاق أو الحد.` : preview.blockReason,
        variant: "destructive",
      });
      return;
    }

    if (preview.requiresTypedConfirmation && highVolumeConfirmText.trim().toUpperCase() !== HIGH_VOLUME_CONFIRM_PHRASE) {
      toast({
        title: language === "ar" ? "تأكيد إضافي مطلوب" : "Extra confirmation required",
        description: language === "ar" ? `اكتب ${HIGH_VOLUME_CONFIRM_PHRASE} لتأكيد إنشاء حملة كبيرة.` : `Type ${HIGH_VOLUME_CONFIRM_PHRASE} to confirm this high-volume campaign.`,
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    let campaignId: string | null = null;

    try {
      const [{ tpl, templateSnapshot }, assignments, userResult] =
        await Promise.all([
          loadTemplateSnapshot(),
          buildAssignments(),
          supabase.auth.getUser(),
        ]);

      if (assignments.length !== preview.totalAssignments) {
        toast({
          title: language === "ar" ? "تغيرت البيانات" : "Data changed",
          description:
            language === "ar"
              ? "تغير عدد التقييمات منذ آخر معاينة. يرجى إعادة المعاينة."
              : "The assignment count changed since the last preview. Please preview again.",
          variant: "destructive",
        });
        setPreview(null);
        return;
      }

      const campaignPayload = {
        campaign_type: campaignType,
        campaign_scope: assignments[0]?.evaluationScope ?? null,
        department_id: selectedDepartment,
        source_unit_id:
          campaignType === "self_station" && selfStationMode === "specific"
            ? selectedSourceUnit
            : null,
        target_unit_id:
          campaignType === "cross_station" ? selectedTargetUnit : null,
        template_id: selectedTemplateId,
        period: currentMonth,
        status: "generating",
        assignment_strategy: preview.strategy,
        max_evaluatees_per_evaluator: preview.maxPerEvaluator,
        expected_evaluations: preview.totalAssignments,
        created_evaluations: 0,
        created_by: userResult.data.user?.id ?? null,
        metadata: {
          evaluator_count: preview.evaluatorCount,
          evaluatee_count: preview.evaluateeCount,
          max_assignments_for_one_evaluator:
            preview.maxAssignmentsForOneEvaluator,
          source: "InitiateEvaluationDialog",
          self_station_mode: campaignType === "self_station" ? selfStationMode : null,
          cross_station_batch:
            campaignType === "cross_station"
              ? {
                  main_unit_id: selectedTargetUnit,
                  selected_unit_ids: selectedCrossStationIds,
                  direction: crossStationDirection,
                }
              : null,
          preview_breakdowns: preview.breakdowns,
        },
      };

      const { data: campaignData, error: campaignError } = await db
        .from("evaluation_campaigns")
        .insert(campaignPayload)
        .select("id")
        .single();

      if (campaignError) {
        throw new Error(
          `${campaignError.message}${campaignError.code === "42P01" ? " — run supabase db push first." : ""}`,
        );
      }

      campaignId = campaignData?.id ?? null;
      const evaluationRecords = assignments.map((assignment) =>
        createBaseEvaluation({
          evaluator: assignment.evaluator,
          evaluatee: assignment.evaluatee,
          currentMonth,
          tpl,
          templateSnapshot,
          evaluationType: assignment.evaluationType,
          evaluationScope: assignment.evaluationScope,
          managerAssignmentId: assignment.managerAssignmentId,
          campaignId,
          assignmentStrategy: preview.strategy,
        }),
      );

      let createdCount = 0;
      for (const batch of chunkArray(evaluationRecords, INSERT_BATCH_SIZE)) {
        const { error: evalError } = await db
          .from("evaluations")
          .insert(batch)
          .select("id");
        if (evalError) throw evalError;
        createdCount += batch.length;

        if (campaignId) {
          await db
            .from("evaluation_campaigns")
            .update({
              created_evaluations: createdCount,
              updated_at: new Date().toISOString(),
            })
            .eq("id", campaignId);
        }
      }

      if (campaignId) {
        await db
          .from("evaluation_campaigns")
          .update({
            status: "sent",
            created_evaluations: createdCount,
            generated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", campaignId);
      }

      toast({
        title: language === "ar" ? "تم الإرسال بنجاح" : "Successfully Sent",
        description:
          language === "ar"
            ? `تم إنشاء ${createdCount} تقييم لقسم ${selectedDept?.name_ar}`
            : `Created ${createdCount} evaluations for ${selectedDept?.name_en}`,
      });

      setSelectedDepartment("");
      setSelectedSourceUnit("");
      setSelectedTargetUnit("");
      setSelectedBatchStationIds([]);
      setCrossStationDirection("selected_to_main");
      setSelectedTemplateId("");
      setPreview(null);
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error initiating evaluation:", error);
      if (campaignId) {
        await db
          .from("evaluation_campaigns")
          .update({
            status: "failed",
            notes: error.message || "Generation failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", campaignId);
      }
      toast({
        title: language === "ar" ? "خطأ" : "Error",
        description:
          error.message ||
          (language === "ar" ? "فشل في إرسال الطلب" : "Failed to send request"),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {copy.icon}
            {language === "ar" ? copy.titleAr : copy.titleEn}
          </DialogTitle>
          <DialogDescription>
            {language === "ar" ? copy.descriptionAr : copy.descriptionEn}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>
              {language === "ar" ? "اختر القسم" : "Select Department"}
            </Label>
            <Select
              value={selectedDepartment}
              onValueChange={setSelectedDepartment}
            >
              <SelectTrigger>
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Building2 className="w-4 h-4 me-2 text-muted-foreground" />
                )}
                <SelectValue
                  placeholder={
                    language === "ar" ? "اختر القسم" : "Choose department"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {language === "ar" ? dept.name_ar : dept.name_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {campaignType === "self_station" && selectedDepartment && units.length > 0 ? (
            <div className="space-y-3 rounded-lg border border-border/60 bg-secondary/20 p-3">
              <div className="space-y-2">
                <Label>{language === "ar" ? "نطاق التقييم" : "Evaluation scope"}</Label>
                <Select value={selfStationMode} onValueChange={(value) => setSelfStationMode(value as "all" | "specific")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{language === "ar" ? "كل الوحدات/المحطات داخل القسم" : "All units/stations in department"}</SelectItem>
                    <SelectItem value="specific">{language === "ar" ? "وحدة/محطة محددة فقط" : "Specific unit/station only"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selfStationMode === "specific" ? (
                <div className="space-y-2">
                  <Label>{language === "ar" ? "اختر الوحدة / المحطة" : "Select Unit / Station"}</Label>
                  <Select value={selectedSourceUnit} onValueChange={setSelectedSourceUnit} disabled={loadingUnits || units.length === 0}>
                    <SelectTrigger>
                      <SelectValue placeholder={language === "ar" ? "اختر الوحدة" : "Choose unit"} />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {language === "ar" ? unit.name_ar : unit.name_en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="text-xs text-muted-foreground">
                {language === "ar"
                  ? "عند اختيار كل الوحدات، يتم إنشاء تقييم منفصل داخل كل محطة تلقائيًا. الموظفون بدون محطة يتم تخطيهم ويظهرون في التحذيرات."
                  : "When all units are selected, the system automatically creates separate peer evaluations inside each station. Employees without a station are skipped and shown in warnings."}
              </div>
            </div>
          ) : null}

          {campaignType === "cross_station" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-lg border border-border/60 bg-secondary/20 p-3">
              <div className="space-y-2">
                <Label>
                  {language === "ar" ? "الوحدة المستهدفة" : "Main / Target Station"}
                </Label>
                <Select
                  value={selectedTargetUnit}
                  onValueChange={setSelectedTargetUnit}
                  disabled={
                    !selectedDepartment || loadingUnits || units.length < 2
                  }
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        language === "ar" ? "اختر الوحدة" : "Choose unit"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {language === "ar" ? unit.name_ar : unit.name_en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>
                  {language === "ar" ? "الاتجاه" : "Direction"}
                </Label>
                <Select
                  value={crossStationDirection}
                  onValueChange={(value) =>
                    setCrossStationDirection(value as CrossStationDirection)
                  }
                  disabled={
                    !selectedDepartment || loadingUnits || units.length < 2
                  }
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        language === "ar" ? "اختر الوحدة" : "Choose unit"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="selected_to_main">
                      {language === "ar"
                        ? "المحطات المختارة ← المحطة الرئيسية"
                        : "Selected stations -> Main station"}
                    </SelectItem>
                    <SelectItem value="main_to_selected">
                      {language === "ar"
                        ? "المحطة الرئيسية ← المحطات المختارة"
                        : "Main station -> Selected stations"}
                    </SelectItem>
                    <SelectItem value="bidirectional">
                      {language === "ar" ? "اتجاهان" : "Bidirectional"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>
                    {language === "ar"
                      ? "المحطات المقيِّمة"
                      : "Evaluating stations"}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setSelectedBatchStationIds(
                          selectableCrossStationUnits.map((unit) => unit.id),
                        )
                      }
                      disabled={selectableCrossStationUnits.length === 0}
                    >
                      {language === "ar" ? "اختيار الكل" : "Select All"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedBatchStationIds([])}
                      disabled={selectedCrossStationIds.length === 0}
                    >
                      {language === "ar" ? "مسح الكل" : "Clear All"}
                    </Button>
                  </div>
                </div>
                <div className="max-h-48 space-y-2 overflow-auto rounded-md border border-border/60 bg-background/60 p-2">
                  {selectableCrossStationUnits.length > 0 ? (
                    selectableCrossStationUnits.map((unit) => (
                      <div
                        key={unit.id}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/60"
                      >
                        <Checkbox
                          id={`cross-station-${unit.id}`}
                          checked={selectedCrossStationIds.includes(unit.id)}
                          onCheckedChange={(checked) => {
                            setSelectedBatchStationIds((current) =>
                              checked === true
                                ? Array.from(new Set([...current, unit.id]))
                                : current.filter((id) => id !== unit.id),
                            );
                          }}
                        />
                        <Label
                          htmlFor={`cross-station-${unit.id}`}
                          className="flex-1 cursor-pointer text-sm font-normal"
                        >
                          {language === "ar" ? unit.name_ar : unit.name_en}
                        </Label>
                      </div>
                    ))
                  ) : (
                    <p className="px-2 py-3 text-xs text-muted-foreground">
                      {selectedTargetUnit
                        ? language === "ar"
                          ? "لا توجد محطات أخرى متاحة."
                          : "No other stations are available."
                        : language === "ar"
                          ? "اختر المحطة الرئيسية أولاً."
                          : "Choose the main station first."}
                    </p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {language === "ar"
                    ? "يتم استبعاد المحطة الرئيسية تلقائياً من قائمة المحطات المختارة."
                    : `${selectedCrossStationIds.length} station(s) selected. The main station is excluded automatically.`}
                </p>
              </div>
              <div className="md:col-span-2 text-xs text-muted-foreground">
                {language === "ar"
                  ? "يتطلب هذا النوع وجود وحدتين نشطتين على الأقل داخل نفس القسم."
                  : "Select one main station, choose evaluating stations, then preview the station pairings before creating evaluations."}
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>
              {language === "ar"
                ? "اختر قالب التقييم"
                : "Select Evaluation Template"}
            </Label>
            <Select
              value={selectedTemplateId}
              onValueChange={setSelectedTemplateId}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    language === "ar" ? "اختر القالب" : "Choose template"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {templates.map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">
              {language === "ar"
                ? "سيتم إنشاء طلبات تقييم معلقة فقط؛ لا يتم تعديل التقييمات القديمة أو المكتملة."
                : "Only new pending evaluation requests are created; old or completed evaluations are not changed."}
            </div>
          </div>

          {maxPerEvaluatorApplies ? (
            <div className="space-y-2 rounded-lg border border-border/60 bg-secondary/20 p-3">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-primary" />
                <Label htmlFor="max-per-evaluator">
                  {language === "ar"
                    ? "الحد الأقصى للتقييمات لكل مُقيّم"
                    : "Max evaluatees per evaluator"}
                </Label>
              </div>
              <Input
                id="max-per-evaluator"
                type="number"
                min={1}
                max={1000}
                value={maxPerEvaluatorInput}
                onChange={(event) =>
                  setMaxPerEvaluatorInput(event.target.value)
                }
              />
              <p className="text-xs text-muted-foreground">
                {language === "ar"
                  ? "للثبات مع البيانات الكبيرة، يتم اختيار عينة عادلة وثابتة عندما يكون عدد الزملاء أو المستهدفين أكبر من هذا الحد."
                  : "For big-data stability, the system uses a fair deterministic sample when the available peer/target pool is larger than this cap."}
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 rounded-lg border border-border/60 bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {language === "ar"
                    ? "معاينة الحملة قبل الإرسال"
                    : "Campaign preview before sending"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {language === "ar"
                    ? "يجب حساب المعاينة قبل الإنشاء حتى لا يتم إنشاء آلاف التقييمات بالخطأ."
                    : "Preview is required so thousands of evaluations are not created by mistake."}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handlePreview}
                disabled={
                  previewLoading ||
                  !selectedDepartment ||
                  !selectedTemplateId ||
                  ((campaignType === "cross_station" &&
                    (!selectedTargetUnit || selectedCrossStationIds.length === 0)) ||
                    (campaignType === "self_station" && selfStationMode === "specific" && !selectedSourceUnit))
                }
              >
                {previewLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Gauge className="h-4 w-4" />
                )}
                {language === "ar" ? "حساب المعاينة" : "Preview"}
              </Button>
            </div>

            {preview ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                  <div className="rounded-md bg-secondary/50 p-2">
                    <p className="text-xs text-muted-foreground">
                      {language === "ar" ? "المقيّمون" : "Evaluators"}
                    </p>
                    <p className="text-lg font-bold text-foreground">
                      {preview.evaluatorCount}
                    </p>
                  </div>
                  <div className="rounded-md bg-secondary/50 p-2">
                    <p className="text-xs text-muted-foreground">
                      {language === "ar" ? "المستهدفون" : "Evaluatees"}
                    </p>
                    <p className="text-lg font-bold text-foreground">
                      {preview.evaluateeCount}
                    </p>
                  </div>
                  <div className="rounded-md bg-secondary/50 p-2">
                    <p className="text-xs text-muted-foreground">
                      {language === "ar" ? "إجمالي الطلبات" : "Estimated total forms"}
                    </p>
                    <p className="text-lg font-bold text-primary">
                      {preview.totalAssignments}
                    </p>
                  </div>
                  <div className="rounded-md bg-secondary/50 p-2">
                    <p className="text-xs text-muted-foreground">
                      {language === "ar" ? "أعلى عبء لفرد" : "Max for one user"}
                    </p>
                    <p className="text-lg font-bold text-foreground">
                      {preview.maxAssignmentsForOneEvaluator}
                    </p>
                  </div>
                </div>

                {campaignType === "cross_station" && selectedCrossStationUnits.length > 0 ? (
                  <div className="space-y-2 rounded-md border border-border/60 p-2">
                    <p className="text-xs font-semibold text-foreground">
                      {language === "ar" ? "المحطات المختارة" : "Selected stations"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedCrossStationUnits.map((unit) => (
                        <span
                          key={unit.id}
                          className="rounded-md bg-secondary/60 px-2 py-1 text-xs text-foreground"
                        >
                          {language === "ar" ? unit.name_ar : unit.name_en}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {preview.breakdowns.length > 0 ? (
                  <div className="space-y-2 rounded-md border border-border/60 p-2">
                    <p className="text-xs font-semibold text-foreground">
                      {language === "ar"
                        ? campaignType === "cross_station"
                          ? "أزواج المحطات"
                          : "تفصيل المعاينة حسب الوحدة / المدير"
                        : campaignType === "cross_station"
                          ? "Station pairings"
                          : "Preview breakdown by unit / manager"}
                    </p>
                    <div className="max-h-48 space-y-2 overflow-auto pr-1">
                      {preview.breakdowns.map((item) => (
                        <div key={item.key} className="grid grid-cols-4 gap-2 rounded-md bg-secondary/40 p-2 text-xs">
                          <div className="col-span-4 font-medium text-foreground md:col-span-1">
                            {language === "ar" ? item.labelAr : item.labelEn}
                          </div>
                          <div>{language === "ar" ? "المقيّمون" : "Evaluators"}: <b>{item.evaluatorCount}</b></div>
                          <div>{language === "ar" ? "المستهدفون" : "Evaluatees"}: <b>{item.evaluateeCount}</b></div>
                          <div>{language === "ar" ? "النماذج" : "Forms"}: <b>{item.totalAssignments}</b></div>
                          {item.warnings.length ? (
                            <div className="col-span-4 text-warning-foreground">{item.warnings.join(" • ")}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {preview?.warnings.length ? (
              <div className="space-y-1 rounded-md border border-warning/30 bg-warning/10 p-2 text-xs text-warning-foreground">
                {preview.warnings.map((warning) => (
                  <div key={warning} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      {formatWarning(warning)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {preview?.requiresTypedConfirmation ? (
            <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/10 p-3">
              <Label htmlFor="high-volume-confirm">
                {language === "ar" ? "تأكيد حملة كبيرة" : "High-volume confirmation"}
              </Label>
              <Input
                id="high-volume-confirm"
                value={highVolumeConfirmText}
                onChange={(event) => setHighVolumeConfirmText(event.target.value.toUpperCase())}
                placeholder={HIGH_VOLUME_CONFIRM_PHRASE}
              />
              <p className="text-xs text-muted-foreground">
                {language === "ar"
                  ? `هذه الحملة كبيرة. اكتب ${HIGH_VOLUME_CONFIRM_PHRASE} قبل الإنشاء.`
                  : `This is a large campaign. Type ${HIGH_VOLUME_CONFIRM_PHRASE} before creating it.`}
              </p>
            </div>
          ) : null}

          <Button
            onClick={handleProceed}
            className="w-full gap-2"
            disabled={
              submitting ||
              previewLoading ||
              !selectedDepartment ||
              !selectedTemplateId ||
              !preview ||
              preview.key !== previewKey ||
              !!preview.blockReason ||
              (preview.requiresTypedConfirmation && highVolumeConfirmText.trim().toUpperCase() !== HIGH_VOLUME_CONFIRM_PHRASE) ||
              (campaignType === "cross_station" &&
                (!selectedTargetUnit || selectedCrossStationIds.length === 0)) ||
              (campaignType === "self_station" && selfStationMode === "specific" && !selectedSourceUnit)
            }
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {language === "ar"
              ? preview && preview.key === previewKey
                ? "إنشاء التقييمات"
                : "احسب المعاينة أولاً"
              : preview && preview.key === previewKey
                ? "Create Evaluations"
                : "Preview First"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InitiateEvaluationDialog;
