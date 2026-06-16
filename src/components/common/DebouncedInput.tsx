import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

interface DebouncedInputProps
  extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> {
  value: string;
  onValueChange: (value: string) => void;
  delayMs?: number;
}

/**
 * Keeps typing local and only notifies the parent after a short pause.
 * This prevents large pages/tables from re-rendering on every keystroke.
 */
export default function DebouncedInput({
  value,
  onValueChange,
  delayMs = 250,
  ...props
}: DebouncedInputProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (draft !== value) onValueChange(draft);
    }, delayMs);

    return () => window.clearTimeout(handle);
  }, [delayMs, draft, onValueChange, value]);

  return <Input {...props} value={draft} onChange={(event) => setDraft(event.target.value)} />;
}
