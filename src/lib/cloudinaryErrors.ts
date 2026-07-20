export class CloudinarySessionExpiredError extends Error {
  readonly nonRetryable = true as const;

  constructor() {
    super("Cloudinary upload session expired");
    this.name = "CloudinarySessionExpiredError";
  }
}
