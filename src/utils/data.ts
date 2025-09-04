
import {
  AchievementsSectionInterface,
} from "./interfaces";





import Independiente from "@/assets/img/slider/Independiente.png";
import vidaAsistida from "@/assets/img/slider/vidaAsistida.png";
import Altadependencia from "@/assets/img/slider/Altadependencia.png"; 
import Memorycare from "@/assets/img/slider/memory.png"; 

export const achievementsSection: AchievementsSectionInterface = {
  title: "Cuidarte con respeto es acompañarte en tu independencia.",
  description: "CUIDADOS",
  achievements: [
    {
      title: "Independiente",
      image: Independiente,
      description:
        "Ser independiente es poder realizar tus actividades como lo haces normalmente, con todo el confort y la tranquilidad de saber que siempre encontrarás apoyo si lo necesitas.",
    },
    {
      title: "Vida asistida",
      image: vidaAsistida,
      description:
        "Te ayudamos a realizar tareas de la vida diaria que te van costando trabajo, para que puedas dedicarte a disfrutar del día. Contarás con un equipo que estará para cuidarte.",
    },
    {
      title: "Alta dependencia",
      image: Altadependencia,
      description:
        "Nuestra misión es acompañarte. Sabemos que no es fácil necesitar apoyo en cada momento. Por ello, siempre hay algo que podemos hacer para que cada día esté lleno de sentido.",
    },
    {
      title: "Memory care",
      image: Memorycare,
      description:
        "Cada gesto cuenta sin importar si lo recuerdan. Los cuidamos considerando el tipo de demencia o deterioro cognitivo que tengan, siempre de la mano de especialistas.",
    },
  ],
};






export type CompanySchemaInterface = {
  "@context": string;
  "@type": string;
  name: string;
  url: string;
  logo: string;
  description: string;
  address: {
    "@type": string;
    streetAddress: string;
    addressLocality: string;
    addressRegion: string;
    postalCode: string;
    addressCountry: string;
  };
  contactPoint: {
    "@type": string;
    telephone: string;
    contactType: string;
    email: string;
    areaServed: string;
  };
};

// export const companySchema: CompanySchemaInterface = {
//   "@context": "https://schema.org",
//   "@type": "Organization",
//   name: "EPI Group",
//   url: "https://epigroup.mx",
//   logo: "https://epigroup.mx/epi-logo.svg",
//   description:
//     "Dedicada a construir proyectos de Generación, Almacenamiento y Distribución de Energía.",
//   address: {
//     "@type": "PostalAddress",
//     streetAddress: "Guillermo Gonzalez Camarena 1600 Int 3D",
//     addressLocality: "Santa Fe",
//     addressRegion: "Mexico City",
//     postalCode: "1600",
//     addressCountry: "Mexico",
//   },
//   contactPoint: {
//     "@type": "ContactPoint",
//     telephone: "+52-55-5812-5581",
//     contactType: "customer service",
//     email: "info@epigroup.mx",
//     areaServed: "Worldwide",
//   },
//   // sameAs: [
//   //   "https://facebook.com/yourcompany",
//   //   "https://twitter.com/yourcompany",
//   //   "https://linkedin.com/company/yourcompany",
//   // ],
// };

export const epiEquiposcompanySchema: CompanySchemaInterface = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "EPI Equipos",
  url: "https://epigroup.mx/epi",
  logo: "https://epigroup.mx/epi-logo.svg",
  description:
    "Proveedora de Ingeniería, Diseño y Construcción de plantas industriales.",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Guillermo Gonzalez Camarena 1600 Int 3D",
    addressLocality: "Santa Fe",
    addressRegion: "Mexico City",
    postalCode: "1600",
    addressCountry: "Mexico",
  },
  contactPoint: {
    "@type": "ContactPoint",
    telephone: "+52-55-5812-5581",
    contactType: "customer service",
    email: "info@epigroup.mx",
    areaServed: "Worldwide",
  },
  // sameAs: [
  //   "https://facebook.com/yourcompany",
  //   "https://twitter.com/yourcompany",
  //   "https://linkedin.com/company/yourcompany",
  // ],
};
