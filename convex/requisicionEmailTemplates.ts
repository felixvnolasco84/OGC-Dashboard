const COLORS = {
  background: "#FAFAFA",
  gray: "#716F6D",
  black: "#1D2436",
  white: "#FFFFFF",
  border: "#E5E3E1",
  avatar: "#EEEDEB",
} as const;

export type RequisicionEmailData = {
  actorName: string;
  actionLabel: string;
  projectName: string;
  requisicionTitle: string;
  statusLabel: string;
  message: string;
  ctaUrl: string;
  logoUrl: string;
  occurredAt: number;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function initials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "OG";
}

export function renderRequisicionEmail(data: RequisicionEmailData) {
  const actorName = escapeHtml(data.actorName);
  const actionLabel = escapeHtml(data.actionLabel);
  const projectName = escapeHtml(data.projectName);
  const requisicionTitle = escapeHtml(data.requisicionTitle);
  const statusLabel = escapeHtml(data.statusLabel);
  const message = escapeHtml(data.message);
  const ctaUrl = escapeHtml(data.ctaUrl);
  const logoUrl = escapeHtml(data.logoUrl);
  const actorInitials = escapeHtml(initials(data.actorName));
  const date = escapeHtml(new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(data.occurredAt)));
  const ctaLabel = data.ctaUrl.includes("?requisicion=") ? "Ver requisición" : "Ver requisiciones";

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${requisicionTitle}</title>
    <style>@media screen and (max-width:600px){.email-card{padding:24px 20px!important}.email-title{font-size:21px!important}}</style>
  </head>
  <body style="margin:0;padding:0;background:${COLORS.background};color:${COLORS.black};font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${actionLabel} · ${requisicionTitle}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:${COLORS.background};">
      <tr>
        <td align="center" style="padding:40px 18px 24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:680px;">
            <tr>
              <td style="padding:0 0 28px 2px;">
                <img src="${logoUrl}" width="58" height="58" alt="OGC" style="display:block;width:58px;height:58px;object-fit:contain;border:0;" />
              </td>
            </tr>
            <tr>
              <td class="email-card" style="background:${COLORS.white};border:1px solid ${COLORS.border};border-radius:14px;padding:34px 40px 38px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td valign="top" width="46" style="padding:0 18px 0 0;">
                      <div style="width:46px;height:46px;border-radius:50%;background:${COLORS.avatar};color:${COLORS.gray};font-size:14px;line-height:46px;text-align:center;">${actorInitials}</div>
                    </td>
                    <td valign="top">
                      <div class="email-title" style="color:${COLORS.black};font-size:25px;font-weight:400;line-height:1.28;overflow-wrap:anywhere;word-break:break-word;">
                        <span>${actorName}</span>
                        <span style="color:${COLORS.gray};"> ${actionLabel} en </span>
                        <strong style="font-weight:700;">${requisicionTitle}</strong>
                      </div>
                      <div style="margin-top:16px;color:${COLORS.gray};font-size:14px;line-height:1.5;">
                        ${projectName} &nbsp;·&nbsp; ${statusLabel}
                      </div>
                      <div style="margin-top:18px;color:${COLORS.gray};font-size:12px;line-height:1.5;">${date}</div>
                    </td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;margin-top:30px;background:${COLORS.background};border-left:4px solid ${COLORS.gray};">
                  <tr>
                    <td style="padding:22px 20px;">
                      <div style="margin:0 0 12px;color:${COLORS.gray};font-size:11px;font-weight:700;letter-spacing:1.4px;">DETALLE</div>
                      <div style="color:${COLORS.black};font-size:14px;line-height:1.55;white-space:pre-line;">${message}</div>
                    </td>
                  </tr>
                </table>
                <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:30px auto 0;">
                  <tr>
                    <td bgcolor="${COLORS.black}" style="border-radius:6px;">
                      <a href="${ctaUrl}" style="display:inline-block;padding:14px 25px;color:${COLORS.white};font-size:14px;font-weight:700;text-decoration:none;">${ctaLabel}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:22px 14px 0;color:${COLORS.gray};font-size:11px;line-height:1.5;">
                Este correo fue enviado automáticamente por OGC Dashboard.<br />No respondas a este mensaje.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
