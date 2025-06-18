import { useState } from 'react';
import { Page, Layout, Card, DataTable } from '@shopify/polaris';

export default function ContainersPage() {
  const [rows] = useState([
    ['Box 80L', '0.08', '0.54', '660×460×300', '€18.00', '€22.00'],
    ['Box 32L', '0.032', '1.51', '605×400×220', '€5.05', '€6.16'],
    ['Box 5L', '0.005', '2.45', '350×190×200', '€2.25', '€2.75'],
  ]);

  return (
    <Page title="Isothermal Containers">
      <Layout>
        <Layout.Section>
          <Card>
            <DataTable
              columnContentTypes={['text', 'numeric', 'numeric', 'text', 'text', 'text']}
              headings={['Name', 'Volume (m³)', 'Weight (kg)', 'Dimensions (mm)', 'Cost (excl. VAT)', 'Cost (incl. VAT)']}
              rows={rows}
            />
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
