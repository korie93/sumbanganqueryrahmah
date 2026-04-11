import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface CollectionNicknamePasswordFieldProps {
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  onToggleVisibility: () => void;
  placeholder: string;
  showPassword: boolean;
  value: string;
}

export function CollectionNicknamePasswordField({
  disabled,
  label,
  onChange,
  onToggleVisibility,
  placeholder,
  showPassword,
  value,
}: CollectionNicknamePasswordFieldProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          type={showPassword ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="pr-10"
          disabled={disabled}
        />
        {showPassword ? (
          <button
            type="button"
            className="absolute inset-y-0 right-0 inline-flex items-center px-3 text-muted-foreground hover:text-foreground"
            onClick={onToggleVisibility}
            disabled={disabled}
            aria-label="Hide password"
            title="Hide password"
          >
            <EyeOff className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            className="absolute inset-y-0 right-0 inline-flex items-center px-3 text-muted-foreground hover:text-foreground"
            onClick={onToggleVisibility}
            disabled={disabled}
            aria-label="Show password"
            title="Show password"
          >
            <Eye className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
