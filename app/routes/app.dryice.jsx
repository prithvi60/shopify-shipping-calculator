import { Page, Layout, Card, DataTable } from '@shopify/polaris';

export default function DryIceSettings() {
  const rows = [
    ['Fresh', '1 kg/day', '€2.30/kg', '0.00068 m³/kg'],
    ['Frozen', '2.5 kg/day', '€2.30/kg', '0.00068 m³/kg'],
  ];

  return (
    <Page title="Dry Ice Configuration">
      <Layout>
        <Layout.Section>
          <Card>
            <DataTable
              columnContentTypes={['text', 'text', 'text', 'text']}
              headings={['Type', 'Daily Need', 'Cost per kg', 'Volume per kg']}
              rows={rows}
            />
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
