import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";

// Metadata array
const metaDataList = [
  {
    path: "/",
    title: "OGC",
    description:
      "",
  },
  
];

const DynamicMeta = () => {
  const location = useLocation();
  const currentPath = location.pathname;

  // Find metadata based on current path

  // Sort metadata array by descending path length so that more specific routes match first
  const metaData = [...metaDataList]
    .sort((a, b) => b.path.length - a.path.length)
    .find((meta) => currentPath.startsWith(meta.path)) || {
    title: "Default Title",
    description: "Default description.",
  };

  return (
    <Helmet>
      <title>{metaData.title}</title>
      <meta name="description" content={metaData.description} />
    </Helmet>
  );
};

export default DynamicMeta;
