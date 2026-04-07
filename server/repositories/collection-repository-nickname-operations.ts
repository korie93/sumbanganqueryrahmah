import { db } from "../db-postgres";
import type {
  CollectionNicknameAuthProfile,
  CollectionNicknameSession,
  CollectionStaffNickname,
  CreateCollectionStaffNicknameInput,
  UpdateCollectionStaffNicknameInput,
} from "../storage-postgres";
import {
  clearCollectionNicknameSessionValueByActivity,
  createCollectionStaffNicknameValue,
  deleteCollectionStaffNicknameValue,
  getCollectionNicknameAuthProfileByNameValue,
  getCollectionNicknameSessionValueByActivity,
  getCollectionStaffNicknameByIdValue,
  getCollectionStaffNicknameByNameValue,
  isCollectionStaffNicknameActiveValue,
  listCollectionStaffNicknames,
  setCollectionNicknamePasswordValue,
  setCollectionNicknameSessionValue,
  updateCollectionStaffNicknameValue,
} from "./collection-staff-nickname-utils";

export async function getCollectionStaffNicknamesRepository(filters?: {
  activeOnly?: boolean;
  allowedRole?: "admin" | "user";
}): Promise<CollectionStaffNickname[]> {
  return listCollectionStaffNicknames(db, filters);
}

export async function setCollectionNicknameSessionRepository(params: {
  activityId: string;
  username: string;
  userRole: string;
  nickname: string;
}): Promise<void> {
  return setCollectionNicknameSessionValue(db, params);
}

export async function getCollectionNicknameSessionByActivityRepository(
  activityId: string,
): Promise<CollectionNicknameSession | undefined> {
  return getCollectionNicknameSessionValueByActivity(db, activityId);
}

export async function clearCollectionNicknameSessionByActivityRepository(
  activityId: string,
): Promise<void> {
  return clearCollectionNicknameSessionValueByActivity(db, activityId);
}

export async function getCollectionStaffNicknameByIdRepository(
  id: string,
): Promise<CollectionStaffNickname | undefined> {
  return getCollectionStaffNicknameByIdValue(db, id);
}

export async function getCollectionStaffNicknameByNameRepository(
  nickname: string,
): Promise<CollectionStaffNickname | undefined> {
  return getCollectionStaffNicknameByNameValue(db, nickname);
}

export async function getCollectionNicknameAuthProfileByNameRepository(
  nickname: string,
): Promise<CollectionNicknameAuthProfile | undefined> {
  return getCollectionNicknameAuthProfileByNameValue(db, nickname);
}

export async function setCollectionNicknamePasswordRepository(params: {
  nicknameId: string;
  passwordHash: string;
  mustChangePassword?: boolean;
  passwordResetBySuperuser?: boolean;
  passwordUpdatedAt?: Date | null;
}): Promise<void> {
  return setCollectionNicknamePasswordValue(db, params);
}

export async function createCollectionStaffNicknameRepository(
  data: CreateCollectionStaffNicknameInput,
): Promise<CollectionStaffNickname> {
  return createCollectionStaffNicknameValue(db, data);
}

export async function updateCollectionStaffNicknameRepository(
  id: string,
  data: UpdateCollectionStaffNicknameInput,
): Promise<CollectionStaffNickname | undefined> {
  return db.transaction(async (tx) => {
    return updateCollectionStaffNicknameValue(tx, id, data);
  });
}

export async function deleteCollectionStaffNicknameRepository(
  id: string,
): Promise<{ deleted: boolean; deactivated: boolean }> {
  return deleteCollectionStaffNicknameValue(db, id);
}

export async function isCollectionStaffNicknameActiveRepository(nickname: string): Promise<boolean> {
  return isCollectionStaffNicknameActiveValue(db, nickname);
}
