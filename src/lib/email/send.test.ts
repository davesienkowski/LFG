// sendEmail() transport-seam tests (node env, NO live SMTP). nodemailer and
// resend are stubbed via vi.mock; EMAIL_PROVIDER is set per-suite BEFORE the
// dynamic import of ./send (the provider is read once at module load, so each
// suite resets the module registry and re-imports with the desired env).
//
// Proves: none -> {ok:false} with no transport call (D-02); smtp -> sendMail
// called with a single string `to` (never CC/array) and the exact from/subject/
// html; a rate-limit error -> rateLimited:true; the error string never contains
// the seeded SMTP_PASS (T-04-05).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Shared spies the mocked modules delegate to.
const sendMailSpy = vi.fn();
const resendSendSpy = vi.fn();

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: sendMailSpy })),
  },
}));

vi.mock("resend", () => ({
  Resend: vi.fn(() => ({ emails: { send: resendSendSpy } })),
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  sendMailSpy.mockReset();
  resendSendSpy.mockReset();
  // Start each test from a clean email-env slate.
  for (const k of [
    "EMAIL_PROVIDER",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_USER",
    "SMTP_PASS",
    "EMAIL_FROM",
    "RESEND_API_KEY",
  ]) {
    delete process.env[k];
  }
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

async function importSend() {
  return (await import("./send")).sendEmail;
}

describe("sendEmail — provider none / unset (D-02)", () => {
  it("returns { ok:false, error:'Email not configured' } and calls no transport", async () => {
    // EMAIL_PROVIDER unset -> defaults to "none".
    const sendEmail = await importSend();
    const result = await sendEmail({
      to: "a@example.com",
      subject: "hi",
      html: "<p>hi</p>",
    });
    expect(result).toEqual({ ok: false, error: "Email not configured" });
    expect(sendMailSpy).not.toHaveBeenCalled();
    expect(resendSendSpy).not.toHaveBeenCalled();
  });
});

describe("sendEmail — smtp", () => {
  it("calls sendMail with a single string `to` (never CC/array) and exact fields", async () => {
    process.env.EMAIL_PROVIDER = "smtp";
    process.env.SMTP_HOST = "mailpit";
    process.env.SMTP_PORT = "1025";
    process.env.EMAIL_FROM = "dev@localhost";
    sendMailSpy.mockResolvedValue({ messageId: "abc" });

    const sendEmail = await importSend();
    const result = await sendEmail({
      to: "alex@example.com",
      subject: "You're invited: Game Night",
      html: "<p>vote</p>",
    });

    expect(result).toEqual({ ok: true });
    expect(sendMailSpy).toHaveBeenCalledTimes(1);
    const call = sendMailSpy.mock.calls[0][0];
    expect(call.from).toBe("dev@localhost");
    expect(call.subject).toBe("You're invited: Game Night");
    expect(call.html).toBe("<p>vote</p>");
    // Single string recipient — never an array (no CC/BCC-all, T-04-03).
    expect(call.to).toBe("alex@example.com");
    expect(Array.isArray(call.to)).toBe(false);
    expect(call.cc).toBeUndefined();
    expect(call.bcc).toBeUndefined();
  });

  it("maps a rate-limit transport error to rateLimited:true and never leaks the password (T-04-05)", async () => {
    process.env.EMAIL_PROVIDER = "smtp";
    process.env.SMTP_HOST = "smtp.gmail.com";
    process.env.SMTP_USER = "me@gmail.com";
    process.env.SMTP_PASS = "super-secret-app-password";
    process.env.EMAIL_FROM = "me@gmail.com";
    sendMailSpy.mockRejectedValue(new Error("450 4.2.1 rate limit exceeded"));

    const sendEmail = await importSend();
    const result = await sendEmail({
      to: "alex@example.com",
      subject: "s",
      html: "<p>h</p>",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rateLimited).toBe(true);
      // The returned error string must NOT echo the seeded password.
      expect(result.error).not.toContain("super-secret-app-password");
    }
  });

  it("returns a non-rate-limited failure for an ordinary transport error", async () => {
    process.env.EMAIL_PROVIDER = "smtp";
    process.env.SMTP_HOST = "mailpit";
    process.env.EMAIL_FROM = "dev@localhost";
    sendMailSpy.mockRejectedValue(new Error("ECONNREFUSED"));

    const sendEmail = await importSend();
    const result = await sendEmail({
      to: "alex@example.com",
      subject: "s",
      html: "<p>h</p>",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rateLimited).toBe(false);
      expect(result.error).toContain("ECONNREFUSED");
    }
  });
});

describe("sendEmail — resend", () => {
  it("sends via the Resend API with a single-element `to` array and returns ok", async () => {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "poll@lfg.example";
    resendSendSpy.mockResolvedValue({ data: { id: "1" }, error: null });

    const sendEmail = await importSend();
    const result = await sendEmail({
      to: "sam@example.com",
      subject: "s",
      html: "<p>h</p>",
    });

    expect(result).toEqual({ ok: true });
    expect(resendSendSpy).toHaveBeenCalledTimes(1);
    const call = resendSendSpy.mock.calls[0][0];
    expect(call.to).toEqual(["sam@example.com"]);
    expect(call.from).toBe("poll@lfg.example");
    expect(sendMailSpy).not.toHaveBeenCalled();
  });

  it("returns { ok:false } when the Resend API surfaces an error", async () => {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "poll@lfg.example";
    resendSendSpy.mockResolvedValue({
      data: null,
      error: { message: "domain not verified" },
    });

    const sendEmail = await importSend();
    const result = await sendEmail({ to: "sam@example.com", subject: "s", html: "<p>h</p>" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("domain not verified");
  });
});
