export class AuthError extends Error {
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "AuthError";
  }
}

export class NoBusinessError extends Error {
  constructor(message = "This account has no business yet") {
    super(message);
    this.name = "NoBusinessError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "You don't have permission to do this") {
    super(message);
    this.name = "ForbiddenError";
  }
}
