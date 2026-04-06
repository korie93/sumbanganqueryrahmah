import { normalizeCollectionNicknameIds } from "@/pages/collection-nicknames/utils";

export function buildCollectionNicknameMemberIds(params: {
  assignedIds: string[];
  excludedId: string;
  nicknameById: Map<string, unknown>;
}) {
  return normalizeCollectionNicknameIds(
    params.assignedIds.filter(
      (id) => id !== params.excludedId && params.nicknameById.has(id),
    ),
  );
}

export function normalizeCollectionNicknameInput(value: string) {
  const nickname = value.trim();
  return nickname.length >= 2 ? nickname : null;
}

export function buildNicknamePasswordResetDescription(params: {
  nickname: string;
  temporaryPassword: string;
}) {
  return params.temporaryPassword
    ? `${params.nickname} telah direset. Password sementara: ${params.temporaryPassword}. Pengguna perlu login menggunakan password ini dan terus tetapkan password baharu.`
    : `${params.nickname} telah direset. Gunakan password sementara semasa yang ditetapkan oleh sistem dan tetapkan password baharu selepas login.`;
}
