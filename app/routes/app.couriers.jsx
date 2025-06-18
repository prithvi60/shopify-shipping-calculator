import { useState } from 'react';
import { Page, Layout, Card, DataTable } from '@shopify/polaris';

export default function CouriersPage() {
  const [rows] = useState([
    ['GLS', 'Germany', '0–2kg = €6', '5000', '10:00 = €5', '10%', '22%'],
    ['FedEx', 'Italy (Sicily)', '0–5kg = €8', '5000', '12:00 = €3', '12%', '22%'],
  ]);

  return (
    <Page title="Courier Settings">
      <Layout>
        <Layout.Section>
          <Card>
            <DataTable
              columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text']}
              headings={['Courier', 'Region', 'Weight Brackets', 'Volumetric Factor', 'Delivery Fees', 'Fuel Surcharge', 'VAT %']}
              rows={rows}
            />
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
