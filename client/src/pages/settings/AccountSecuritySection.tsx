import {
  MyAccountSecurityCard,
  type MyAccountSecurityCardProps,
} from "@/pages/settings/MyAccountSecurityCard";

export interface AccountSecuritySectionProps {
  securityCard: MyAccountSecurityCardProps;
}

export function AccountSecuritySection(props: AccountSecuritySectionProps) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <MyAccountSecurityCard {...props.securityCard} />
    </div>
  );
}
