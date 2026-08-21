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
import { STATIC_NEUTRAL_COLORS } from "../lib/design-tokens";

interface WelcomeViewerEmailProps {
  name: string;
  loginUrl: string;
  projectCount: number;
}

export default function WelcomeViewerEmail({
  name,
  loginUrl,
  projectCount,
}: WelcomeViewerEmailProps) {
  const projectCopy = projectCount === 1
    ? "el proyecto asignado a tu cuenta"
    : "los proyectos asignados a tu cuenta";

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
              puedes consultar la información de {projectCopy}: presupuesto,
              avance de obra, documentos y bitácora, todo en un solo lugar.
            </Text>
          </Section>

          <Section style={steps}>
            <Text style={stepText}>
              <span style={stepNumber}>01</span>
              <strong>Inicia sesión</strong> con el botón de este correo.
            </Text>
            <Text style={stepText}>
              <span style={stepNumber}>02</span>
              <strong>Explora tus proyectos</strong> y consulta la información
              disponible en modo de solo lectura.
            </Text>
            <Text style={stepTextLast}>
              <span style={stepNumber}>03</span>
              <strong>Reporta cualquier duda</strong> con tu administrador si
              necesitas acceso a otro proyecto o notas algún dato pendiente.
            </Text>
          </Section>

          <Section style={buttonSection}>
            <Button href={loginUrl} style={button}>
              Entrar a mi cuenta
            </Button>
          </Section>

          <Section style={viewerCard}>
            <Text style={viewerCardTitle}>Tu acceso es de consulta</Text>
            <Text style={viewerCopy}>
              Tu perfil viewer está pensado para revisar información sin
              modificarla. Podrás navegar por los proyectos asignados y ver el
              avance actualizado que el equipo administrador cargue en la
              plataforma.
            </Text>
            <Text style={viewerCardTitle}>Qué puedes revisar</Text>
            <Text style={viewerCopy}>
              Presupuesto, control financiero, programa de obra, bitácora y
              documentos del proyecto, según los permisos asignados a tu cuenta.
            </Text>
            <Text style={viewerCopyLast}>
              Si algo no aparece como esperabas, responde este correo o contacta
              a tu administrador para revisar tus permisos.
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
  backgroundColor: STATIC_NEUTRAL_COLORS.surface,
  color: STATIC_NEUTRAL_COLORS.foreground,
  fontFamily: "Arial, Helvetica, sans-serif",
};

const container = {
  maxWidth: "660px",
  margin: "56px auto 40px",
  backgroundColor: STATIC_NEUTRAL_COLORS.surface,
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
  color: STATIC_NEUTRAL_COLORS.foreground,
  fontSize: "31px",
  fontWeight: "500",
  lineHeight: "1.2",
};

const paragraph = {
  margin: "0 0 56px",
  color: STATIC_NEUTRAL_COLORS.bodyText,
  fontSize: "18px",
  lineHeight: "1.45",
};

const steps = {
  padding: "0 38px 44px",
};

const stepNumber = {
  display: "inline-block",
  width: "36px",
  color: STATIC_NEUTRAL_COLORS.disabledForeground,
  fontSize: "18px",
};

const stepText = {
  margin: "0 0 32px",
  color: STATIC_NEUTRAL_COLORS.bodyText,
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
  color: STATIC_NEUTRAL_COLORS.foreground,
  fontSize: "13px",
  fontWeight: "700",
  padding: "15px 20px",
  textDecoration: "none",
  textAlign: "center" as const,
};

const viewerCard = {
  margin: "0",
  padding: "48px 56px 56px",
  backgroundColor: STATIC_NEUTRAL_COLORS.background,
  border: `1px solid ${STATIC_NEUTRAL_COLORS.border}`,
  borderRadius: "7px",
};

const viewerCardTitle = {
  margin: "0 0 4px",
  color: STATIC_NEUTRAL_COLORS.foreground,
  fontSize: "16px",
  fontWeight: "700",
  lineHeight: "1.45",
};

const viewerCopy = {
  margin: "0 0 28px",
  color: STATIC_NEUTRAL_COLORS.bodyText,
  fontSize: "16px",
  lineHeight: "1.45",
};

const viewerCopyLast = {
  ...viewerCopy,
  margin: "0",
};

const footer = {
  padding: "24px 38px 0",
};

const muted = {
  margin: "0",
  color: STATIC_NEUTRAL_COLORS.subtleForeground,
  fontSize: "12px",
  lineHeight: "1.5",
};

const linkText = {
  margin: "6px 0 0",
  color: STATIC_NEUTRAL_COLORS.mutedForeground,
  fontSize: "12px",
  lineHeight: "1.5",
  wordBreak: "break-all" as const,
};
