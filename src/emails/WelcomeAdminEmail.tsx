import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";

const TEMPLATE_DOWNLOAD_URL = "https://drive.google.com/drive/folders/1uzn_nHnoryv2M_syMDVjPqWabc-SyzQK?usp=sharing";

interface WelcomeAdminEmailProps {
  name: string;
  loginUrl: string;
  projectCount: number;
}

export default function WelcomeAdminEmail({
  name,
  loginUrl,
  projectCount,
}: WelcomeAdminEmailProps) {
  const projectCopy = projectCount === 1
    ? "el proyecto que ya cargamos a tu cuenta"
    : "los proyectos que ya cargamos a tu cuenta";

  return (
    <Html>
      <Head />
      <Preview>Tu acceso a OGC Dashboard está listo</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img
              src="https://www.ogc.mx/Logo.svg"
              alt="OGC"
              style={logo}
            />
          </Section>

          <Section style={intro}>
            <Heading style={heading}>
              Tu acceso
              <br />
              ya está listo.
            </Heading>
            <Text style={paragraph}>
              Hola {name}, configuramos tu cuenta en la plataforma. Desde hoy
              puedes monitorear presupuesto, avance de obra y documentos de
              proyecto, todo en un solo lugar.
            </Text>
          </Section>

          <Section style={steps}>
            <Text style={stepText}>
              <span style={stepNumber}>01</span>
              <strong>Inicia sesión</strong> y revisa {projectCopy}.
            </Text>
            <Text style={stepText}>
              <span style={stepNumber}>02</span>
              <strong>Dime si algo no cuadra</strong>: partidas, etapas,
              nombres de proyecto o permisos. Lo ajustamos de inmediato.
            </Text>
            <Text style={stepTextLast}>
              <span style={stepNumber}>03</span>
              <strong>Agendamos 30 minutos</strong> para resolver dudas y
              afinar el setup antes de que empieces a operar.
            </Text>
          </Section>

          <Section style={buttonSection}>
            <Button href={loginUrl} style={button}>
              Entrar a mi cuenta
            </Button>
          </Section>

          <Section style={templatesCard}>
            <Text style={templatesIntro}>
              Para que la plataforma funcione desde el primer día, necesitamos
              que cargues tu información en los formatos correctos. Preparamos
              dos templates listos para llenar:
            </Text>
            <Section style={templateButtonSection}>
              <Button href={TEMPLATE_DOWNLOAD_URL} style={secondaryButton}>
                Descargar templates
              </Button>
            </Section>
            <Text style={templateTitle}>Template 1 — Presupuesto de obra</Text>
            <Text style={templateCopy}>
              Captura tus partidas, subpartidas y montos aprobados por
              proyecto. Este archivo es la base del control financiero; sin él,
              no hay presupuesto contra qué comparar.
            </Text>
            <Text style={templateTitle}>Template 2 — Carga de transacciones</Text>
            <Text style={templateCopy}>
              Registra tus gastos, pagos a proveedores y movimientos de obra.
              Puedes exportar directo de tu sistema contable o llenarlo
              manualmente.
            </Text>
            <Text style={templateCopyLast}>
              Si tienes dudas sobre cómo llenar algún campo, escríbeme antes de
              nuestra llamada y lo resolvemos juntos.
            </Text>
          </Section>

          <Section style={footer}>
            <Text style={muted}>
              Si el botón no funciona, copia y pega este enlace en tu navegador:
            </Text>
            <Text style={linkText}>{loginUrl}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  margin: "0",
  backgroundColor: "#ffffff",
  color: "#242424",
  fontFamily: "Arial, Helvetica, sans-serif",
};

const container = {
  maxWidth: "660px",
  margin: "56px auto 40px",
  backgroundColor: "#ffffff",
};

const header = {
  padding: "0 38px 70px",
};

const logo = {
  height: "32px",
  width: "auto",
  display: "block",
};

const intro = {
  padding: "0 38px",
};

const heading = {
  margin: "0 0 22px",
  color: "#242424",
  fontSize: "31px",
  fontWeight: "500",
  lineHeight: "1.2",
};

const paragraph = {
  margin: "0 0 56px",
  color: "#3f3f3f",
  fontSize: "18px",
  lineHeight: "1.45",
};

const steps = {
  padding: "0 38px 44px",
};

const stepNumber = {
  display: "inline-block",
  width: "36px",
  color: "#b7b7b7",
  fontSize: "18px",
};

const stepText = {
  margin: "0 0 32px",
  color: "#3f3f3f",
  fontSize: "15px",
  lineHeight: "1.55",
};

const stepTextLast = {
  ...stepText,
  margin: "0",
};

const buttonSection = {
  padding: "0 38px 48px",
  textAlign: "center" as const,
};

const button = {
  width: "260px",
  backgroundColor: "#dfff00",
  borderRadius: "6px",
  color: "#242424",
  fontSize: "13px",
  fontWeight: "700",
  padding: "15px 20px",
  textDecoration: "none",
  textAlign: "center" as const,
};

const templatesCard = {
  margin: "0",
  padding: "48px 56px 56px",
  backgroundColor: "#fbfbfb",
  border: "1px solid #e8e8e8",
  borderRadius: "7px",
};

const templatesIntro = {
  margin: "0 0 20px",
  color: "#3f3f3f",
  fontSize: "17px",
  lineHeight: "1.45",
};

const templateButtonSection = {
  padding: "4px 0 58px",
  textAlign: "center" as const,
};

const secondaryButton = {
  width: "260px",
  backgroundColor: "#ffffff",
  border: "1px solid #cfcfcf",
  borderRadius: "6px",
  color: "#8b8b8b",
  fontSize: "13px",
  fontWeight: "700",
  padding: "13px 18px",
  textAlign: "center" as const,
  textDecoration: "none",
};

const templateTitle = {
  margin: "0 0 4px",
  color: "#242424",
  fontSize: "16px",
  fontWeight: "700",
  lineHeight: "1.45",
};

const templateCopy = {
  margin: "0 0 28px",
  color: "#3f3f3f",
  fontSize: "16px",
  lineHeight: "1.45",
};

const templateCopyLast = {
  ...templateCopy,
  margin: "0",
};

const footer = {
  padding: "24px 38px 0",
};

const muted = {
  margin: "0",
  color: "#8b8b8b",
  fontSize: "12px",
  lineHeight: "1.5",
};

const linkText = {
  margin: "6px 0 0",
  color: "#6f6f6f",
  fontSize: "12px",
  lineHeight: "1.5",
  wordBreak: "break-all" as const,
};
