const SAFE_CODES: Record<string, string> = {
  AUTHENTICATION_REQUIRED: "Your session has expired. Sign in and try again.",
  INSUFFICIENT_CREDITS: "You do not have enough credits for this report.",
  PROJECT_ACCESS_DENIED: "This project is not available to your workspace.",
  WORKER_NOT_CONFIGURED: "Research processing is temporarily unavailable. Your reserved credit was restored.",
  PIPELINE_INITIALIZATION_FAILED: "Research processing could not start. Your reserved credit was restored.",
  JOB_ENQUEUE_FAILED: "Research processing could not start. Your reserved credit was restored.",
  EXPORT_FAILED: "The export could not be prepared. Your report remains available.",
};

export function publicErrorMessage(code: string, fallback = "Something went wrong. Please try again.") {
  return SAFE_CODES[code] ?? fallback;
}

export function authErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("already registered") || normalized.includes("already exists")) {
    return "An account already exists for this email. Sign in or reset your password.";
  }
  if (normalized.includes("invalid login credentials")) return "Incorrect email or password.";
  if (normalized.includes("email not confirmed")) return "Verify your email before signing in.";
  if (normalized.includes("rate limit")) return "Too many attempts. Wait a moment and try again.";
  return "Authentication could not be completed. Please try again.";
}
