import { CollectionNicknameAlertDialogs } from "@/pages/collection-nicknames/CollectionNicknameAlertDialogs";
import { CollectionNicknameFormDialogs } from "@/pages/collection-nicknames/CollectionNicknameFormDialogs";
import type { CollectionNicknameDialogsProps } from "@/pages/collection-nicknames/collection-nickname-dialog-types";

export type { CollectionNicknameDialogsProps } from "@/pages/collection-nicknames/collection-nickname-dialog-types";

export function CollectionNicknameDialogs(props: CollectionNicknameDialogsProps) {
  return (
    <>
      <CollectionNicknameFormDialogs {...props} />
      <CollectionNicknameAlertDialogs {...props} />
    </>
  );
}
