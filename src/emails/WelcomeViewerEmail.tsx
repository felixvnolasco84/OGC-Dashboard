import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

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
  const projectText = projectCount === 1
    ? "Tienes 1 proyecto asignado."
    : `Tienes ${projectCount} proyectos asignados.`;

  return (
    <Html>
      <Head />
      <Preview>Tu acceso a OGC Dashboard está listo</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={eyebrow}>OGC Dashboard</Text>
            <Heading style={heading}>Bienvenido, {name}</Heading>
            <Text style={paragraph}>
              Tu acceso ya fue configurado. {projectText} Usa el botón para
              crear o entrar a tu cuenta y abrir directamente tu dashboard.
            </Text>
          </Section>

          <Section style={buttonSection}>
            <Button href={loginUrl} style={button}>
              Entrar a mi cuenta
            </Button>
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
  backgroundColor: "#f6f7f9",
  color: "#111827",
  fontFamily: "Arial, Helvetica, sans-serif",
};

const container = {
  maxWidth: "560px",
  margin: "48px auto",
  backgroundColor: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
};

const header = {
  padding: "40px 40px 20px",
};

const eyebrow = {
  margin: "0",
  color: "#6b7280",
  fontSize: "13px",
  fontWeight: "700",
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
};

const heading = {
  margin: "28px 0 12px",
  color: "#111827",
  fontSize: "28px",
  fontWeight: "600",
  lineHeight: "1.2",
};

const paragraph = {
  margin: "0",
  color: "#4b5563",
  fontSize: "16px",
  lineHeight: "1.6",
};

const buttonSection = {
  padding: "12px 40px 28px",
};

const button = {
  backgroundColor: "#111827",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: "700",
  padding: "13px 20px",
  textDecoration: "none",
};

const footer = {
  padding: "0 40px 36px",
};

const muted = {
  margin: "0",
  color: "#6b7280",
  fontSize: "13px",
  lineHeight: "1.6",
};

const linkText = {
  margin: "8px 0 0",
  color: "#374151",
  fontSize: "13px",
  lineHeight: "1.6",
  wordBreak: "break-all" as const,
};
