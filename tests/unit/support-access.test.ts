import { describe, it, expect } from "vitest";
import { computeAccess } from "@/lib/server/services/support";
import type { SupportThread } from "@/lib/server/repositories/support";
import type { User } from "@/lib/server/types";

function makeThread(over: Partial<SupportThread> = {}): SupportThread {
  return {
    id: 1,
    publicId: "sup_test",
    kind: "ticket",
    visibility: "public",
    status: "open",
    authorUserId: 10,
    title: "title",
    body: "body",
    claimedByUserId: null,
    claimedAt: null,
    solvedAt: null,
    starCount: 0,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    authorUsername: "author",
    claimedByUsername: null,
    ...over,
  };
}

// computeAccess only reads viewer.id; the rest of User is irrelevant here.
function viewer(id: number): User {
  return { id } as User;
}

describe("support access — viewing", () => {
  it("anyone may view a public thread, even logged out", () => {
    const a = computeAccess({
      thread: makeThread({ visibility: "public" }),
      viewer: null,
      isStaff: false,
      isAdmin: false,
      isClaimer: false,
      isInvited: false,
    });
    expect(a.canView).toBe(true);
    expect(a.canComment).toBe(false); // not signed in
    expect(a.canStar).toBe(false);
  });

  it("a logged-out viewer cannot see a private thread", () => {
    const a = computeAccess({
      thread: makeThread({ visibility: "private" }),
      viewer: null,
      isStaff: false,
      isAdmin: false,
      isClaimer: false,
      isInvited: false,
    });
    expect(a.canView).toBe(false);
  });

  it("the author always sees their own private thread", () => {
    const a = computeAccess({
      thread: makeThread({ visibility: "private", authorUserId: 10 }),
      viewer: viewer(10),
      isStaff: false,
      isAdmin: false,
      isClaimer: false,
      isInvited: false,
    });
    expect(a.canView).toBe(true);
    expect(a.canComment).toBe(true);
  });

  it("a supporter sees an unclaimed private thread but not one claimed by someone else", () => {
    const unclaimed = computeAccess({
      thread: makeThread({ visibility: "private", claimedByUserId: null }),
      viewer: viewer(20),
      isStaff: true,
      isAdmin: false,
      isClaimer: false,
      isInvited: false,
    });
    expect(unclaimed.canView).toBe(true);

    const claimedByOther = computeAccess({
      thread: makeThread({ visibility: "private", claimedByUserId: 99 }),
      viewer: viewer(20),
      isStaff: true,
      isAdmin: false,
      isClaimer: false,
      isInvited: false,
    });
    expect(claimedByOther.canView).toBe(false);
  });

  it("an invited supporter sees a privately-claimed thread", () => {
    const a = computeAccess({
      thread: makeThread({ visibility: "private", claimedByUserId: 99 }),
      viewer: viewer(20),
      isStaff: true,
      isAdmin: false,
      isClaimer: false,
      isInvited: true,
    });
    expect(a.canView).toBe(true);
  });

  it("an admin sees any private thread", () => {
    const a = computeAccess({
      thread: makeThread({ visibility: "private", claimedByUserId: 99 }),
      viewer: viewer(1),
      isStaff: true,
      isAdmin: true,
      isClaimer: false,
      isInvited: false,
    });
    expect(a.canView).toBe(true);
  });
});

describe("support access — claiming and managing", () => {
  it("a supporter can claim an unclaimed ticket but not an issue", () => {
    const ticket = computeAccess({
      thread: makeThread({ kind: "ticket", claimedByUserId: null }),
      viewer: viewer(20),
      isStaff: true,
      isAdmin: false,
      isClaimer: false,
      isInvited: false,
    });
    expect(ticket.canClaim).toBe(true);

    const issue = computeAccess({
      thread: makeThread({ kind: "issue", claimedByUserId: null }),
      viewer: viewer(20),
      isStaff: true,
      isAdmin: false,
      isClaimer: false,
      isInvited: false,
    });
    expect(issue.canClaim).toBe(false);
  });

  it("only the claimer or an admin can manage a thread", () => {
    const claimer = computeAccess({
      thread: makeThread({ claimedByUserId: 20 }),
      viewer: viewer(20),
      isStaff: true,
      isAdmin: false,
      isClaimer: true,
      isInvited: false,
    });
    expect(claimer.canManage).toBe(true);

    const otherStaff = computeAccess({
      thread: makeThread({ claimedByUserId: 20 }),
      viewer: viewer(30),
      isStaff: true,
      isAdmin: false,
      isClaimer: false,
      isInvited: true,
    });
    expect(otherStaff.canManage).toBe(false);

    const admin = computeAccess({
      thread: makeThread({ claimedByUserId: 20 }),
      viewer: viewer(1),
      isStaff: true,
      isAdmin: true,
      isClaimer: false,
      isInvited: false,
    });
    expect(admin.canManage).toBe(true);
  });
});

describe("support access — commenting and stars", () => {
  it("a non-staff user cannot comment on a closed thread, but staff can", () => {
    const member = computeAccess({
      thread: makeThread({ visibility: "public", status: "closed" }),
      viewer: viewer(50),
      isStaff: false,
      isAdmin: false,
      isClaimer: false,
      isInvited: false,
    });
    expect(member.canComment).toBe(false);

    const staff = computeAccess({
      thread: makeThread({ visibility: "public", status: "closed" }),
      viewer: viewer(20),
      isStaff: true,
      isAdmin: false,
      isClaimer: false,
      isInvited: false,
    });
    expect(staff.canComment).toBe(true);
  });

  it("stars are only offered on public threads to signed-in users", () => {
    const publicSignedIn = computeAccess({
      thread: makeThread({ visibility: "public" }),
      viewer: viewer(50),
      isStaff: false,
      isAdmin: false,
      isClaimer: false,
      isInvited: false,
    });
    expect(publicSignedIn.canStar).toBe(true);

    const privateSignedIn = computeAccess({
      thread: makeThread({ visibility: "private", authorUserId: 50 }),
      viewer: viewer(50),
      isStaff: false,
      isAdmin: false,
      isClaimer: false,
      isInvited: false,
    });
    expect(privateSignedIn.canStar).toBe(false);
  });

  it("edit/delete are author-or-admin; publish only for private threads", () => {
    const author = computeAccess({
      thread: makeThread({ visibility: "private", authorUserId: 10 }),
      viewer: viewer(10),
      isStaff: false,
      isAdmin: false,
      isClaimer: false,
      isInvited: false,
    });
    expect(author.canEditThread).toBe(true);
    expect(author.canDeleteThread).toBe(true);
    expect(author.canPublish).toBe(true); // private -> can publish

    const authorPublic = computeAccess({
      thread: makeThread({ visibility: "public", authorUserId: 10 }),
      viewer: viewer(10),
      isStaff: false,
      isAdmin: false,
      isClaimer: false,
      isInvited: false,
    });
    expect(authorPublic.canPublish).toBe(false); // already public

    const stranger = computeAccess({
      thread: makeThread({ visibility: "public", authorUserId: 10 }),
      viewer: viewer(50),
      isStaff: false,
      isAdmin: false,
      isClaimer: false,
      isInvited: false,
    });
    expect(stranger.canEditThread).toBe(false);
    expect(stranger.canDeleteThread).toBe(false);

    const supporterNotAuthor = computeAccess({
      thread: makeThread({ visibility: "private", authorUserId: 10, claimedByUserId: 20 }),
      viewer: viewer(20),
      isStaff: true,
      isAdmin: false,
      isClaimer: true,
      isInvited: false,
    });
    expect(supporterNotAuthor.canEditThread).toBe(false); // claimer != author

    const admin = computeAccess({
      thread: makeThread({ visibility: "private", authorUserId: 10 }),
      viewer: viewer(1),
      isStaff: true,
      isAdmin: true,
      isClaimer: false,
      isInvited: false,
    });
    expect(admin.canEditThread).toBe(true);
    expect(admin.canDeleteThread).toBe(true);
  });

  it("internal notes are restricted to staff", () => {
    const staff = computeAccess({
      thread: makeThread({ visibility: "private", claimedByUserId: null }),
      viewer: viewer(20),
      isStaff: true,
      isAdmin: false,
      isClaimer: false,
      isInvited: false,
    });
    expect(staff.canInternalNote).toBe(true);

    const author = computeAccess({
      thread: makeThread({ visibility: "private", authorUserId: 10 }),
      viewer: viewer(10),
      isStaff: false,
      isAdmin: false,
      isClaimer: false,
      isInvited: false,
    });
    expect(author.canInternalNote).toBe(false);
  });
});
