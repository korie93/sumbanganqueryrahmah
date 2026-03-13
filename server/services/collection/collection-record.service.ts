import { badRequest, forbidden, notFound } from "../../http/errors";
import {
  getAdminGroupNicknameValues,
  getAdminVisibleNicknameValues,
  hasNicknameValue,
  readNicknameFiltersFromQuery,
} from "../../routes/collection-access";
import { removeCollectionReceiptFile, saveCollectionReceipt } from "../../routes/collection-receipt.service";
import {
  COLLECTION_BATCHES,
  COLLECTION_STAFF_NICKNAME_MIN_LENGTH,
  ensureLooseObject,
  isNicknameScopeAllowedForRole,
  isValidCollectionDate,
  isValidCollectionPhone,
  normalizeCollectionText,
  parseCollectionAmount,
  type CollectionBatchValue,
  type CollectionCreatePayload,
  type CollectionReceiptPayload,
  type CollectionUpdatePayload,
} from "../../routes/collection.validation";
import { CollectionServiceSupport, type ListQuery, type SummaryQuery } from "./collection-service-support";

export class CollectionRecordService extends CollectionServiceSupport {
  async createRecord(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], bodyRaw: unknown) {
    const user = this.requireUser(userInput);
    let uploadedReceiptPath: string | null = null;

    try {
      const body = (ensureLooseObject(bodyRaw) || {}) as CollectionCreatePayload;
      const customerName = normalizeCollectionText(body.customerName);
      const icNumber = normalizeCollectionText(body.icNumber);
      const customerPhone = normalizeCollectionText(body.customerPhone);
      const accountNumber = normalizeCollectionText(body.accountNumber);
      const batch = normalizeCollectionText(body.batch).toUpperCase();
      const paymentDate = normalizeCollectionText(body.paymentDate);
      const collectionStaffNickname = normalizeCollectionText(body.collectionStaffNickname);
      const amount = parseCollectionAmount(body.amount);

      if (!customerName) throw badRequest("Customer Name is required.");
      if (!icNumber) throw badRequest("IC Number is required.");
      if (!isValidCollectionPhone(customerPhone)) throw badRequest("Customer Phone Number is invalid.");
      if (!accountNumber) throw badRequest("Account Number is required.");
      if (!COLLECTION_BATCHES.has(batch)) throw badRequest("Invalid batch value.");
      if (!paymentDate || !isValidCollectionDate(paymentDate)) throw badRequest("Invalid payment date.");
      if (amount === null) throw badRequest("Amount must be a positive number.");
      if (collectionStaffNickname.length < COLLECTION_STAFF_NICKNAME_MIN_LENGTH) {
        throw badRequest("Staff nickname must be at least 2 characters.");
      }

      const staffNickname = await this.storage.getCollectionStaffNicknameByName(collectionStaffNickname);
      if (!staffNickname?.isActive) {
        throw badRequest("Staff nickname tidak sah atau sudah inactive.");
      }
      if (user.role === "admin") {
        const allowedNicknames = await getAdminVisibleNicknameValues(this.storage, user);
        if (!hasNicknameValue(allowedNicknames, collectionStaffNickname)) {
          throw forbidden("Nickname tidak dibenarkan untuk akaun admin ini.");
        }
      } else if (!isNicknameScopeAllowedForRole(staffNickname.roleScope, user.role)) {
        throw forbidden("Nickname ini tidak dibenarkan untuk role semasa.");
      }

      const receiptPayload = ensureLooseObject(body.receipt) as CollectionReceiptPayload | null;
      if (receiptPayload) {
        uploadedReceiptPath = await saveCollectionReceipt(receiptPayload);
      }

      const record = await this.storage.createCollectionRecord({
        customerName,
        icNumber,
        customerPhone,
        accountNumber,
        batch: batch as CollectionBatchValue,
        paymentDate,
        amount,
        receiptFile: uploadedReceiptPath,
        createdByLogin: user.username,
        collectionStaffNickname,
      });

      await this.storage.createAuditLog({
        action: "COLLECTION_RECORD_CREATED",
        performedBy: user.username,
        targetResource: record.id,
        details: `Collection record created by ${user.username}`,
      });

      return { ok: true as const, record };
    } catch (err) {
      if (uploadedReceiptPath) {
        await removeCollectionReceiptFile(uploadedReceiptPath);
      }
      throw err;
    }
  }

  async getSummary(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], query: SummaryQuery) {
    const user = this.requireUser(userInput);
    const yearRaw = normalizeCollectionText(query.year);
    const requestedNicknameFilters = readNicknameFiltersFromQuery(query);
    const parsedYear = yearRaw ? Number.parseInt(yearRaw, 10) : new Date().getFullYear();

    if (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
      throw badRequest("Invalid year.");
    }

    let nicknameFilters: string[] | undefined;
    if (user.role === "superuser") {
      if (requestedNicknameFilters.length > 0) {
        const activeNicknames = await this.storage.getCollectionStaffNicknames({ activeOnly: true });
        const activeSet = new Set(
          activeNicknames
            .map((item) => normalizeCollectionText(item.nickname).toLowerCase())
            .filter(Boolean),
        );
        const hasInvalid = requestedNicknameFilters.some((value) => !activeSet.has(value.toLowerCase()));
        if (hasInvalid) {
          throw badRequest("Invalid nickname filter.");
        }
        nicknameFilters = requestedNicknameFilters;
      }
    } else if (user.role === "admin") {
      const allowedNicknames = await getAdminGroupNicknameValues(this.storage, user);
      if (requestedNicknameFilters.length > 0) {
        const hasInvalid = requestedNicknameFilters.some((value) => !hasNicknameValue(allowedNicknames, value));
        if (hasInvalid) {
          throw badRequest("Invalid nickname filter.");
        }
        nicknameFilters = requestedNicknameFilters;
      } else if (allowedNicknames.length === 0) {
        return this.buildEmptySummary(parsedYear);
      } else {
        nicknameFilters = allowedNicknames;
      }
    }

    const summary = await this.storage.getCollectionMonthlySummary({
      year: parsedYear,
      nicknames: nicknameFilters,
      createdByLogin: user.role === "user" ? user.username : undefined,
    });

    return {
      ok: true as const,
      year: parsedYear,
      summary,
    };
  }

  async listRecords(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], query: ListQuery) {
    const user = this.requireUser(userInput);
    const from = normalizeCollectionText(query.from);
    const to = normalizeCollectionText(query.to);
    const search = normalizeCollectionText(query.search);
    const nickname = normalizeCollectionText(query.nickname);

    if (from && !isValidCollectionDate(from)) throw badRequest("Invalid from date.");
    if (to && !isValidCollectionDate(to)) throw badRequest("Invalid to date.");
    if (from && to && from > to) throw badRequest("From date cannot be later than To date.");

    let nicknameFilters: string[] | undefined;
    if (user.role === "superuser") {
      if (nickname) {
        const isActiveNickname = await this.storage.isCollectionStaffNicknameActive(nickname);
        if (!isActiveNickname) {
          throw badRequest("Invalid nickname filter.");
        }
        nicknameFilters = [nickname];
      }
    } else if (user.role === "admin") {
      const allowedNicknames = await getAdminVisibleNicknameValues(this.storage, user);
      if (nickname) {
        if (!hasNicknameValue(allowedNicknames, nickname)) {
          throw badRequest("Invalid nickname filter.");
        }
        nicknameFilters = [nickname];
      } else if (allowedNicknames.length === 0) {
        return { ok: true as const, records: [] };
      } else {
        nicknameFilters = allowedNicknames;
      }
    }

    const records = await this.storage.listCollectionRecords({
      from: from || undefined,
      to: to || undefined,
      search: search || undefined,
      createdByLogin: user.role === "user" ? user.username : undefined,
      nicknames: nicknameFilters,
      limit: 1000,
    });

    return { ok: true as const, records };
  }

  async updateRecord(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    idRaw: unknown,
    bodyRaw: unknown,
  ) {
    const user = this.requireUser(userInput);
    const id = normalizeCollectionText(idRaw);
    if (!id) {
      throw badRequest("Collection id is required.");
    }

    const existing = await this.storage.getCollectionRecordById(id);
    if (!existing) {
      throw notFound("Collection record not found.");
    }

    let uploadedReceiptPath: string | null = null;
    try {
      const body = (ensureLooseObject(bodyRaw) || {}) as CollectionUpdatePayload;
      const updatePayload: Record<string, unknown> = {};
      const customerName = normalizeCollectionText(body.customerName);
      const icNumber = normalizeCollectionText(body.icNumber);
      const customerPhone = normalizeCollectionText(body.customerPhone);
      const accountNumber = normalizeCollectionText(body.accountNumber);
      const batch = normalizeCollectionText(body.batch).toUpperCase();
      const paymentDate = normalizeCollectionText(body.paymentDate);
      const collectionStaffNickname = normalizeCollectionText(body.collectionStaffNickname);
      const amount = body.amount !== undefined ? parseCollectionAmount(body.amount) : null;

      if (body.customerName !== undefined) {
        if (!customerName) throw badRequest("Customer Name cannot be empty.");
        updatePayload.customerName = customerName;
      }
      if (body.icNumber !== undefined) {
        if (!icNumber) throw badRequest("IC Number cannot be empty.");
        updatePayload.icNumber = icNumber;
      }
      if (body.customerPhone !== undefined) {
        if (!isValidCollectionPhone(customerPhone)) throw badRequest("Customer Phone Number is invalid.");
        updatePayload.customerPhone = customerPhone;
      }
      if (body.accountNumber !== undefined) {
        if (!accountNumber) throw badRequest("Account Number cannot be empty.");
        updatePayload.accountNumber = accountNumber;
      }
      if (body.batch !== undefined) {
        if (!COLLECTION_BATCHES.has(batch)) throw badRequest("Invalid batch value.");
        updatePayload.batch = batch;
      }
      if (body.paymentDate !== undefined) {
        if (!paymentDate || !isValidCollectionDate(paymentDate)) throw badRequest("Invalid payment date.");
        updatePayload.paymentDate = paymentDate;
      }
      if (body.amount !== undefined) {
        if (amount === null) throw badRequest("Amount must be a positive number.");
        updatePayload.amount = amount;
      }
      if (body.collectionStaffNickname !== undefined) {
        if (collectionStaffNickname.length < COLLECTION_STAFF_NICKNAME_MIN_LENGTH) {
          throw badRequest("Staff nickname must be at least 2 characters.");
        }
        const staffNickname = await this.storage.getCollectionStaffNicknameByName(collectionStaffNickname);
        if (!staffNickname?.isActive) {
          throw badRequest("Staff nickname tidak sah atau sudah inactive.");
        }
        if (user.role === "admin") {
          const allowedNicknames = await getAdminVisibleNicknameValues(this.storage, user);
          if (!hasNicknameValue(allowedNicknames, collectionStaffNickname)) {
            throw forbidden("Nickname tidak dibenarkan untuk akaun admin ini.");
          }
        } else if (!isNicknameScopeAllowedForRole(staffNickname.roleScope, user.role)) {
          throw forbidden("Nickname ini tidak dibenarkan untuk role semasa.");
        }
        updatePayload.collectionStaffNickname = collectionStaffNickname;
      }

      const shouldRemoveReceipt = body.removeReceipt === true;
      const receiptPayload = ensureLooseObject(body.receipt) as CollectionReceiptPayload | null;
      if (shouldRemoveReceipt && receiptPayload) {
        throw badRequest("Cannot remove and upload receipt at the same time.");
      }
      if (receiptPayload) {
        uploadedReceiptPath = await saveCollectionReceipt(receiptPayload);
        updatePayload.receiptFile = uploadedReceiptPath;
      } else if (shouldRemoveReceipt) {
        updatePayload.receiptFile = null;
      }

      if (Object.keys(updatePayload).length === 0) {
        return { ok: true as const, record: existing };
      }

      const updated = await this.storage.updateCollectionRecord(id, updatePayload);
      if (!updated) {
        if (uploadedReceiptPath) {
          await removeCollectionReceiptFile(uploadedReceiptPath);
        }
        throw notFound("Collection record not found.");
      }

      if ((receiptPayload || shouldRemoveReceipt) && existing.receiptFile) {
        await removeCollectionReceiptFile(existing.receiptFile);
      }

      await this.storage.createAuditLog({
        action: "COLLECTION_RECORD_UPDATED",
        performedBy: user.username,
        targetResource: updated.id,
        details: `Collection record updated by ${user.username}`,
      });

      return { ok: true as const, record: updated };
    } catch (err) {
      if (uploadedReceiptPath) {
        await removeCollectionReceiptFile(uploadedReceiptPath);
      }
      throw err;
    }
  }

  async deleteRecord(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], idRaw: unknown) {
    const user = this.requireUser(userInput);
    const id = normalizeCollectionText(idRaw);
    if (!id) {
      throw badRequest("Collection id is required.");
    }

    const existing = await this.storage.getCollectionRecordById(id);
    if (!existing) {
      throw notFound("Collection record not found.");
    }

    await this.storage.deleteCollectionRecord(id);
    if (existing.receiptFile) {
      await removeCollectionReceiptFile(existing.receiptFile);
    }

    await this.storage.createAuditLog({
      action: "COLLECTION_RECORD_DELETED",
      performedBy: user.username,
      targetResource: existing.id,
      details: `Collection record deleted by ${user.username}`,
    });

    return { ok: true as const };
  }
}
