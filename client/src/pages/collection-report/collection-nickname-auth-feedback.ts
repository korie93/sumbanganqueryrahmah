export type CollectionNicknameSetupMode = "first-time" | "forced-change";

export function getCollectionNicknameSetupDescription(setupMode: CollectionNicknameSetupMode): string {
  if (setupMode === "forced-change") {
    return "Password sementara telah disahkan. Sila tetapkan kata laluan baharu untuk meneruskan.";
  }

  return "Sila tetapkan kata laluan baharu untuk nickname ini sebelum meneruskan.";
}

export function getCollectionNicknameForcedChangeToast() {
  return {
    title: "Password Sementara Disahkan",
    description: "Password sementara diterima. Sila tetapkan kata laluan baharu untuk meneruskan.",
  };
}
