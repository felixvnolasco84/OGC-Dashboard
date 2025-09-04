export interface HeroSectionInterface {
  title: string;
  description: string;
  image: string;
}

export interface AboutSectionInterface {
  title: string;
  description: string;
  image: string;
  associationCompany: { title: string; description: string; path: string }[];
}

export interface AchievementsSectionInterface {
  title: string;
  description: string;
  achievements: {
    title: string;
    image: string;
    description: string;
  }[];
}

export interface EPIFeaturesSectionInterface {
  title: string;
  description: string;
  achievements: {
    icon: string;
    title: string;
    description: string;
  }[];
}

export interface CompaniesSectionInterface {
  title: string;
  description: string;
  services: {
    image: string;
    logo: string;
    title: string;
    subtitle: string;
    description: string;
    cta: {
      title: string;
      path: string;
    };
  }[];
}


export interface CarrouselOfExternalLinksInterface {
  title: string;
  description: string;
  image: string;
  externalLink: string; 
}

  export interface ServiceInterface {
    image: string;
    title: string;
    additionalExternalLink?: string;
    description?: string;
    partnerLogo?: string;
    parternExternalLink?: string;
    slug: string;
    previousLink: string;
    nextLink: string;
    products?: {
      title: string;
      description: string;
      buttonExternalLink?: string;
      carrouselOfExternalLinks?: CarrouselOfExternalLinksInterface[];
      slug: string;
      image: string;
      cta?: {
        title: string;
        externalLink: string;
      };
    }[];
    footerLinks?: {
      title: string;
      externalLink: string;
    }[];
  }
