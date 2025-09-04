import { PhoneCall } from "lucide-react";
import {
  //  FaFacebook,
  //  FaLinkedinIn
  // FaPhone,
  FaInstagram,
} from "react-icons/fa";

import { NavLink } from "react-router";

export default function Footer() {
  const socials = [
    // {
    //   icon: FaFacebook,
    //   link: "#",
    // },
    {
      icon: FaInstagram,
      link: "https://www.instagram.com/ogcgrupo?igsh=MWJwYWcxanh6dWdx",
      label: "@ogcgrupo",
    },  
    {
      icon: PhoneCall,
      link: "tel:5622008895",      
      label: "56-2200-8895",  
    },
  ];

  return (
    <footer className="bg-[#0033A1]">
      <div className="mx-auto mt-12 flex max-w-7xl flex-col items-start justify-between gap-12 px-4 py-12 lg:mt-24 lg:flex-row lg:items-center lg:gap-0 lg:px-12 lg:py-24">
        <div className="flex items-center gap-4">
          <NavLink to="/">
            <h1 className="text-left text-3xl font-light text-white lg:text-4xl">
              Nuestro propósito <br />
              <span className="noto-serif-display italic">es acompañarte</span>
            </h1>
          </NavLink>
        </div>

        <div className="grid gap-4">
          {/* <div className="flex items-center gap-4 text-sm text-white">
            <a href="tel:+525558125581" target="_blank" rel="noreferrer">
              <FaPhone className="h-4 w-4 rotate-90 text-[#48A0FF]" />
            </a>
            <span>+52 (55) 5812 5581</span>
          </div> */}
          <div className="flex gap-4 text-white">
            <ul className="flex flex-col gap-4">
              {socials.map((social, index) => (
                <a href={social.link} target="_blank" rel="noreferrer">
                  <li className="flex items-center gap-2" key={index}>
                    <social.icon className="h-6 w-6 text-[#48A0FF]" />
                    <span>{social.label}</span>
                  </li>
                </a>
              ))}
            </ul>          
          </div>
        </div>

        <div className="grid gap-4 text-left text-white underline">
          <NavLink to="/legal">Legal</NavLink>
          <NavLink to="/aviso-de-privacidad">Aviso de Privacidad</NavLink>
        </div>
      </div>
    </footer>
  );
}
