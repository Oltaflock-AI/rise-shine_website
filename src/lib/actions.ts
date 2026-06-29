"use server";

/**
 * Enquiry form handler.
 *
 * PLACEHOLDER: validates the submission and acknowledges it. Wiring the lead to
 * email / CRM (e.g. Resend, or a TBO/agency lead inbox) is a later step — drop
 * the integration into the marked TODO below; the form UI won't change.
 */

export type FormState = {
  status: "idle" | "success" | "error";
  message: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function submitEnquiry(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  if (name.length < 2) {
    return { status: "error", message: "Please tell us your name." };
  }
  if (phone.replace(/\D/g, "").length < 7) {
    return { status: "error", message: "Please add a valid phone number." };
  }
  if (email && !EMAIL_RE.test(email)) {
    return { status: "error", message: "That email address doesn't look right." };
  }

  // TODO: deliver the enquiry (email/CRM/webhook). Reads as a no-op for now.
  await new Promise((resolve) => setTimeout(resolve, 600));

  return {
    status: "success",
    message:
      "Thank you! Your enquiry has reached the Rise & Shine team — we'll be in touch very shortly.",
  };
}
