import { CompanySchemaInterface } from "@/utils/data";
import { Helmet } from "react-helmet";

const StructuredData = ({ data }: { data: CompanySchemaInterface }) => {
  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(data)}</script>
    </Helmet>
  );
};

export default StructuredData;
