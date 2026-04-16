import assert from "node:assert/strict";
import test from "node:test";
import {
  buildToastAnnouncement,
  resolveToastAnnouncementPriority,
} from "@/components/toast-live-region-utils";

test("buildToastAnnouncement joins toast title and description into concise live-region copy", () => {
  assert.equal(
    buildToastAnnouncement({
      title: "Import Complete",
      description: "2 files imported successfully",
    }),
    "Import Complete. 2 files imported successfully",
  );
});

test("resolveToastAnnouncementPriority maps destructive toasts to assertive announcements", () => {
  assert.equal(resolveToastAnnouncementPriority({ variant: "default" }), "polite");
  assert.equal(resolveToastAnnouncementPriority({ variant: "destructive" }), "assertive");
});
