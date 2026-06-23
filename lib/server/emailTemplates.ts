import { authBaseUrl } from "./config";

export type EmailVerificationPurpose = "settings" | "change" | "register";

const copy: Record<EmailVerificationPurpose, { subject: string; heading: string; intro: string }> = {
  settings: {
    subject: "Your bottleneck verification code",
    heading: "Verify your email",
    intro: "Please use the following code to verify your email address:",
  },
  change: {
    subject: "Confirm your new email",
    heading: "Confirm your new email",
    intro: "Please use the following code to confirm your new email address:",
  },
  register: {
    subject: "Confirm your email",
    heading: "Confirm your email",
    intro: "Please use the following code to confirm your email and finish creating your account:",
  },
};

export function verificationEmailSubject(purpose: EmailVerificationPurpose) {
  return copy[purpose].subject;
}

// Transactional verification email. Same table skeleton as a standard
// provider template (centered 560px white card, logo header, heading, body +
// code + sign-off, footer help link), reskinned to the bottleneck logotype and
// a black-blue palette. Inline styles only - email clients strip <style>,
// webfonts, and CSS variables, so everything here is web-safe.
export function buildVerificationEmailHtml(input: {
  code: string;
  purpose: EmailVerificationPurpose;
}): string {
  const { heading, intro } = copy[input.purpose];
  const logo = `${authBaseUrl()}/email-logo.png`;
  const help = `${authBaseUrl()}/support`;
  const font = "Helvetica, Arial, sans-serif";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <title>${heading}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;width:100%;background-color:#ffffff;font-family:${font};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#ffffff;opacity:0;">${heading} - your bottleneck verification code</div>
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="width:560px;max-width:560px;background-color:#ffffff;border-collapse:collapse;">
          <tr>
            <td valign="top" style="padding:27px 24px 24px 24px;">
              <img alt="bottleneck" src="${logo}" width="140" style="width:140px;max-width:100%;display:block;border:0;outline:none;text-decoration:none;">
            </td>
          </tr>
          <tr>
            <td align="left" style="padding:8px 24px;font-family:${font};font-size:28px;line-height:36px;font-weight:700;color:#0b1220;">
              ${heading}
            </td>
          </tr>
          <tr>
            <td align="left" style="padding:12px 24px 0 24px;font-family:${font};font-size:16px;line-height:24px;color:#1f2937;">
              ${intro}
            </td>
          </tr>
          <tr>
            <td align="left" style="padding:16px 24px;font-family:${font};font-size:36px;line-height:44px;font-weight:700;letter-spacing:6px;color:#0b1220;">
              ${input.code}
            </td>
          </tr>
          <tr>
            <td align="left" style="padding:0 24px;font-family:${font};font-size:14px;line-height:22px;color:#6b7280;">
              This code expires in 10 minutes. If you didn't request it, you can ignore this email.
            </td>
          </tr>
          <tr>
            <td align="left" style="padding:24px 24px 0 24px;font-family:${font};font-size:16px;line-height:24px;color:#1f2937;">
              Best,<br>bottleneck
            </td>
          </tr>
        </table>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="width:560px;max-width:560px;border-collapse:collapse;">
          <tr>
            <td align="left" style="padding:24px;font-family:${font};font-size:14px;line-height:20px;color:#6b7280;">
              If you have any questions, contact us through our <a href="${help}" style="color:#1d4ed8;text-decoration:none;">help center</a>.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
