// utils/analytics.ts
import ReactGA from "react-ga";

const TRACKING_ID = "UA-XXXXXXXXX-X"; // Replace with your Google Analytics tracking ID

export const initGA = () => {
  ReactGA.initialize(TRACKING_ID);
};

export const logPageView = () => {
  ReactGA.set({ page: window.location.pathname });
  ReactGA.pageview(window.location.pathname);
};
