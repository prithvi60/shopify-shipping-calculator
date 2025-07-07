import React, { useState, useCallback, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Frame,
  Page,
  Layout,
  Card,
  IndexTable,
  TextField,
  Modal,
  TextContainer,
  Toast
} from '@shopify/polaris';
import { useFetcher, useLoaderData } from '@remix-run/react';

// Backend routes in app/routes/api/brt.ts should handle loader and action
// Loader returns existing BRTRegion records, Action upserts received JSON data

const defaultRegions = [
  "VAL D'AOSTA",
  "PIEMONTE",
  "LOMBARDIA",
  "LIGURIA",
  "VENETO",
  "FRIULI VG",
  "TRENTINO A.A.",
  "EMILIA ROMAGNA",
  "TOSCANA",
  "UMBRIA",
  "MARCHE",
  "LAZIO",
  "ABRUZZO",
  "MOLISE",
  "CAMPANIA",
  "PUGLIA",
  "BASILICATA",
  "CALABRIA",
  "SICILIA",
  "SARDEGNA"
];

export default function BRTRegionEditor() {
  const fetcher = useFetcher();
  const loaderData = useLoaderData();
  // Initialize table with backend data, or default regions with empty prices
  const initialData = Array.isArray(loaderData) && loaderData.length > 0
    ? loaderData
    : defaultRegions.map((region, index) => ({ id: index.toString(), region, price: '' }));

  const [data, setData] = useState(initialData);
  const [fileName, setFileName] = useState('');
  const [pendingUpdates, setPendingUpdates] = useState({});
  const [modalActive, setModalActive] = useState(false);
  const [toastContent, setToastContent] = useState(null);

  // Show toast when save to backend completes
  useEffect(() => {
    if (fetcher.type === 'done' && fetcher.data?.success) {
      setToastContent('Saved to backend successfully');
    }
  }, [fetcher]);

  // Handle Excel file upload via input
  const handleFile = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const workbook = XLSX.read(evt.target.result, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const updates = {};
        rows.forEach(([region, price]) => {
          if (
            typeof region === 'string' &&
            (typeof price === 'number' || typeof price === 'string') &&
            region.trim().length > 0 &&
            region.trim().toUpperCase() !== 'REGION'
          ) {
            updates[region.trim().toUpperCase()] = price;
          }
        });
        const updateKeys = Object.keys(updates);
        console.log('Found update keys:', updateKeys);
        if (!updateKeys.length) {
          setToastContent('Invalid file format. No matching regions found.');
          return;
        }
        setPendingUpdates(updates);
        setModalActive(true);
      } catch (err) {
        console.error('Error parsing file:', err);
        setToastContent('Error reading Excel file. Please try again.');
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  // Apply pending updates, persist to backend
  const applyUpdates = useCallback(() => {
    const updated = data.map(row => ({
      ...row,
      price: pendingUpdates[row.region.toUpperCase()] ?? row.price
    }));
    setData(updated);
    setModalActive(false);
    setPendingUpdates({});
    // Post JSON array to backend action
    fetcher.submit(
      { data: JSON.stringify(updated) },
      { method: 'post', action: '/api/brt' }
    );
  }, [data, pendingUpdates, fetcher]);

  // Handle manual cell edits
  const handleChange = useCallback((index, _key, value) => {
    setData(prev => {
      const copy = [...prev];
      copy[index].price = value;
      return copy;
    });
  }, []);

  // Render table rows
  const rowMarkup = useMemo(() =>
    data.map(({ id, region, price }, index) => (
      <IndexTable.Row key={id} id={id} position={index}>
        <IndexTable.Cell>{region}</IndexTable.Cell>
        <IndexTable.Cell>
          <TextField
            labelHidden
            type="number"
            value={price ?? ''}
            onChange={value => handleChange(index, 'price', value)}
            autoComplete="off"
          />
        </IndexTable.Cell>
      </IndexTable.Row>
    )), [data, handleChange]
  );

  return (
    <Frame>
      <Page
        title="BRT Shipping Regions Editor"
        primaryAction={{
          content: 'Save Changes',
          onAction: applyUpdates
        }}
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
              {fileName && (
                <TextContainer>
                  <p>Uploaded: {fileName}</p>
                </TextContainer>
              )}
            </Card>

            {/* Confirmation Modal */}
            <Modal
              open={modalActive}
              onClose={() => setModalActive(false)}
              title="Confirm Excel Import"
              primaryAction={{ content: 'Apply Updates', onAction: applyUpdates }}
              secondaryActions={[{ content: 'Cancel', onAction: () => setModalActive(false) }]}
            >
              <Modal.Section>
                <TextContainer>
                  This will overwrite the table values based on the uploaded file. Continue?
                </TextContainer>
              </Modal.Section>
            </Modal>

            {/* Editable Table */}
            <Card>
              <IndexTable
                resourceName={{ singular: 'row', plural: 'rows' }}
                itemCount={data.length}
                selectable={false}
                headings={[
                  { title: 'Region' },
                  { title: 'Price for 100 KG' }
                ]}
              >
                {rowMarkup}
              </IndexTable>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
      {toastContent && (
        <Toast content={toastContent} onDismiss={() => setToastContent(null)} />
      )}
    </Frame>
  );
}
