// A single typed error for every invitation domain-rule rejection (rate
// limited, expired/revoked/already-accepted, wrong-account mismatch,
// invalid reportsToId, ...), carrying its own HTTP status — same pattern
// as AuthError/ForbiddenError/NoBusinessError in lib/auth/errors.ts,
// mapped in lib/api/respond.ts the same way.
export class InvitationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "InvitationError";
    this.status = status;
  }
}
