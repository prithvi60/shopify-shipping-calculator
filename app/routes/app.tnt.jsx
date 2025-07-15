import React, { useState, useCallback, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Frame,
  Page,
  Layout,
  Card,
  TextField,
  IndexTable,
  Modal,
  Toast,
  TextContainer
} from '@shopify/polaris';
import { useFetcher, useLoaderData } from '@remix-run/react';

export default function FedexRateEditor() {
  const fetcher = useFetcher();
  const loaderData = useLoaderData();

  const zones = ['ZONA A', 'ZONA B', 'ZONA C', 'ZONA D', 'ZONA E', 'ZONA F', 'ZONA G', 'ZONA H', 'ZONA I'];

  const initialData = Array.isArray(loaderData) && loaderData.length > 0
    ? loaderData
    : [{ weight: '', ...Object.fromEntries(zones.map(zone => [zone, ''])) }];

  const [data, setData] = useState(initialData);
  const [pendingUpdates, setPendingUpdates] = useState([]);
  const [fileName, setFileName] = useState('');
  const [modalActive, setModalActive] = useState(false);
  const [toastContent, setToastContent] = useState(null);

  useEffect(() => {
    if (fetcher.type === 'done' && fetcher.data?.success) {
      setToastContent('Saved to backend successfully');
    }
  }, [fetcher]);

  const handleFile = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const workbook = XLSX.read(evt.target.result, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        const valid = Array.isArray(rows) && rows.length > 0 && rows[0]['WEIGHT'];
        if (!valid) throw new Error("Invalid format");
        setPendingUpdates(rows);
        setModalActive(true);
      } catch (err) {
        console.error('Error parsing file:', err);
        setToastContent('Invalid Excel format. Please try again.');
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const applyUpdates = useCallback(() => {
    setData(pendingUpdates);
    setModalActive(false);
    setPendingUpdates([]);
    fetcher.submit({ data: JSON.stringify(pendingUpdates) }, { method: 'post', action: '/api/fedex' });
  }, [pendingUpdates, fetcher]);

  const handleChange = useCallback((index, key, value) => {
    setData(prev => {
      const copy = [...prev];
      copy[index][key] = value;
      return copy;
    });
  }, []);

  const rowMarkup = useMemo(() =>
    data.map((row, index) => (
      <IndexTable.Row id={String(index)} key={index} position={index}>
        <IndexTable.Cell>
          <TextField
            labelHidden
            type="number"
            value={row.WEIGHT ?? ''}
            onChange={(val) => handleChange(index, 'WEIGHT', val)}
            autoComplete="off"
          />
        </IndexTable.Cell>
        {zones.map(zone => (
          <IndexTable.Cell key={zone}>
            <TextField
              labelHidden
              type="number"
              value={row[zone] ?? ''}
              onChange={(val) => handleChange(index, zone, val)}
              autoComplete="off"
            />
          </IndexTable.Cell>
        ))}
      </IndexTable.Row>
    )), [data, handleChange]);

  return (
    <Frame>
      <Page
        title="FedEx Rate Table"
        primaryAction={{ content: 'Save Changes', onAction: applyUpdates }}
      >
        <Layout>
          <Layout.Section>
            <Card sectioned>
              <input
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFile}
                style={{ marginBottom: '1rem' }}
              />
              {fileName && <TextContainer><p>Uploaded: {fileName}</p></TextContainer>}
            </Card>

            <Modal
              open={modalActive}
              onClose={() => setModalActive(false)}
              title="Confirm Excel Import"
              primaryAction={{ content: 'Apply Updates', onAction: applyUpdates }}
              secondaryActions={[{ content: 'Cancel', onAction: () => setModalActive(false) }]}
            >
              <Modal.Section>
                <TextContainer>This will overwrite the table from the uploaded file. Proceed?</TextContainer>
              </Modal.Section>
            </Modal>

            <Card>
              <IndexTable
                resourceName={{ singular: 'row', plural: 'rows' }}
                itemCount={data.length}
                selectable={false}
                headings={[
                  { title: 'Weight (KG)' },
                  ...zones.map(zone => ({ title: zone }))
                ]}
              >
                {rowMarkup}
              </IndexTable>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
      {toastContent && <Toast content={toastContent} onDismiss={() => setToastContent(null)} />}
    </Frame>
  );
}
