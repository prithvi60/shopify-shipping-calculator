import { useEffect, useState, useCallback } from 'react';
import {
  Page, Layout, Card, IndexTable, TextField, Toast, Modal, TextContainer, Frame
} from '@shopify/polaris';
import { useFetcher } from '@remix-run/react';

export default function ContainersPage() {
  const fetcher = useFetcher();
  const [data, setData] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    fetcher.load('/api/containers');
  }, []);

  useEffect(() => {
    console.log('📥 fetcher.data:container', fetcher.data); // Debug log

    if (fetcher.data?.containers) {
      setData(fetcher.data.containers.map(row => ({
        name: row.name,
        volume: row.volume,        // ✅ Fixed: API returns 'volume', not 'maxVolumeM3'
        weight: row.weight,        // ✅ Fixed: API returns 'weight', not 'weightKg'
        extL: row.extL,           // ✅ Fixed: API returns 'extL', not 'externalLengthMm'
        extW: row.extW,           // ✅ Fixed: API returns 'extW', not 'externalWidthMm'
        extH: row.extH,           // ✅ Fixed: API returns 'extH', not 'externalHeightMm'
        intL: row.intL,           // ✅ Fixed: API returns 'intL', not 'internalLengthMm'
        intW: row.intW,           // ✅ Fixed: API returns 'intW', not 'internalWidthMm'
        intH: row.intH,           // ✅ Fixed: API returns 'intH', not 'internalHeightMm'
        costExcl: row.costExcl,   // ✅ Fixed: API returns 'costExcl', not 'costVatExcluded'
        costIncl: row.costIncl,   // ✅ Fixed: API returns 'costIncl', not 'costVatIncluded'
      })));
    }
  }, [fetcher.data]);

  const applyUpdates = useCallback(() => {
    console.log('📤 submitting:', data); // Debug log

    const form = new FormData();
    form.append('containers', JSON.stringify(data));
    fetcher.submit(form, { method: 'post', action: '/api/containers' });
    setModalOpen(false);
  }, [data]);

  useEffect(() => {
    if (fetcher.data?.success) setToast('Saved successfully');
  }, [fetcher.data]);

  const handleCell = (i, field, val) => {
    const copy = [...data];
    copy[i] = { ...copy[i], [field]: val };
    setData(copy);
  };

  const headings = [
    'Name', 'Volume (m³)', 'Weight (kg)',
    'Ext L×W×H', 'Int L×W×H',
    'Cost (excl. VAT)', 'Cost (incl. VAT)'
  ];

  const rows = data.map((row, i) => (
    <IndexTable.Row id={String(i)} key={i} position={i}>
      <IndexTable.Cell>
        <TextField labelHidden value={row.name} onChange={v => handleCell(i, 'name', v)} />
      </IndexTable.Cell>
      <IndexTable.Cell>
        <TextField labelHidden value={row.volume} onChange={v => handleCell(i, 'volume', v)} />
      </IndexTable.Cell>
      <IndexTable.Cell>
        <TextField labelHidden value={row.weight} onChange={v => handleCell(i, 'weight', v)} />
      </IndexTable.Cell>
      <IndexTable.Cell>
        <TextField labelHidden value={`${row.extL}×${row.extW}×${row.extH}`} onChange={() => {}} disabled />
      </IndexTable.Cell>
      <IndexTable.Cell>
        <TextField labelHidden value={`${row.intL}×${row.intW}×${row.intH}`} onChange={() => {}} disabled />
      </IndexTable.Cell>
      <IndexTable.Cell>
        <TextField labelHidden value={row.costExcl} onChange={v => handleCell(i, 'costExcl', v)} />
      </IndexTable.Cell>
      <IndexTable.Cell>
        <TextField labelHidden value={row.costIncl} onChange={v => handleCell(i, 'costIncl', v)} />
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Frame>
      <Page
        title="Isothermal Containers"
        primaryAction={{ content: 'Save All', onAction: () => setModalOpen(true) }}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <IndexTable
                itemCount={data.length}
                resourceName={{ singular: 'container', plural: 'containers' }}
                selectable={false}
                headings={headings.map(title => ({ title }))}
              >
                {rows}
              </IndexTable>
            </Card>
          </Layout.Section>
        </Layout>

        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Confirm Save"
          primaryAction={{ content: 'Apply', onAction: applyUpdates }}
          secondaryActions={[{ content: 'Cancel', onAction: () => setModalOpen(false) }]}
        >
          <Modal.Section>
            <TextContainer>This will overwrite all containers. Are you sure?</TextContainer>
          </Modal.Section>
        </Modal>

        {toast && <Toast content={toast} onDismiss={() => setToast(null)} />}
      </Page>
    </Frame>
  );
}
