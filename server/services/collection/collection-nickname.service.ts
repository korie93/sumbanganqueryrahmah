import { CollectionNicknameAuthOperations } from "./collection-nickname-auth-operations";
import { CollectionNicknameManagementOperations } from "./collection-nickname-management-operations";
import { CollectionServiceSupport, type CollectionStoragePort } from "./collection-service-support";

export class CollectionNicknameService extends CollectionServiceSupport {
  private readonly authOperations: CollectionNicknameAuthOperations;
  private readonly managementOperations: CollectionNicknameManagementOperations;

  constructor(storage: CollectionStoragePort) {
    super(storage);
    this.authOperations = new CollectionNicknameAuthOperations(storage);
    this.managementOperations = new CollectionNicknameManagementOperations(storage);
  }

  listNicknames(...args: Parameters<CollectionNicknameManagementOperations["listNicknames"]>) {
    return this.managementOperations.listNicknames(...args);
  }

  createNickname(...args: Parameters<CollectionNicknameManagementOperations["createNickname"]>) {
    return this.managementOperations.createNickname(...args);
  }

  updateNickname(...args: Parameters<CollectionNicknameManagementOperations["updateNickname"]>) {
    return this.managementOperations.updateNickname(...args);
  }

  updateNicknameStatus(...args: Parameters<CollectionNicknameManagementOperations["updateNicknameStatus"]>) {
    return this.managementOperations.updateNicknameStatus(...args);
  }

  deleteNickname(...args: Parameters<CollectionNicknameManagementOperations["deleteNickname"]>) {
    return this.managementOperations.deleteNickname(...args);
  }

  checkNicknameAuth(...args: Parameters<CollectionNicknameAuthOperations["checkNicknameAuth"]>) {
    return this.authOperations.checkNicknameAuth(...args);
  }

  setupNicknamePassword(...args: Parameters<CollectionNicknameAuthOperations["setupNicknamePassword"]>) {
    return this.authOperations.setupNicknamePassword(...args);
  }

  loginNickname(...args: Parameters<CollectionNicknameAuthOperations["loginNickname"]>) {
    return this.authOperations.loginNickname(...args);
  }

  resetNicknamePassword(...args: Parameters<CollectionNicknameAuthOperations["resetNicknamePassword"]>) {
    return this.authOperations.resetNicknamePassword(...args);
  }
}
