export type UserStatus = "pending" | "active" | "limited" | "banned";
export type UserRole = "user" | "admin";

export type User = {
  id: number;
  publicId: string;
  firstName: string;
  username: string;
  bio: string | null;
  email: string;
  emailVerifiedAt: string | null;
  dob: string | null;
  telegramId: string | null;
  telegramUsername: string | null;
  telegramVerifiedAt: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
};

export type Session = {
  id: number;
  userId: number;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

export type SessionWithUser = {
  session: Session;
  user: User;
};

export type ExternalApp = {
  id: number;
  publicId: string;
  name: string;
  slug: string;
  callbackUrl: string | null;
  allowedRedirectUrls: string[];
  requiredProduct: string | null;
  status: "active" | "disabled";
};

export type ActivationRequest = {
  id: number;
  publicId: string;
  externalAppId: number;
  status: "pending" | "approved" | "denied" | "expired" | "cancelled";
  requestedSubject: string | null;
  approvedUserId: number | null;
  scopes: string[];
  callbackUrl: string | null;
  returnUrl: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
};

export type ActivationWithApp = ActivationRequest & {
  app: ExternalApp;
};

export type BearerRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cleared";

export type BearerRequest = {
  id: number;
  publicId: string;
  userId: number;
  appName: string;
  reason: string;
  status: BearerRequestStatus;
  externalAppId: number | null;
  hasPlaintext: boolean;
  decidedByTelegramId: string | null;
  decidedAt: string | null;
  revealedAt: string | null;
  clearedAt: string | null;
  createdAt: string;
};

export type TelegramIdentity = {
  id: string;
  firstName: string;
  username: string | null;
  authDate?: number;
};
