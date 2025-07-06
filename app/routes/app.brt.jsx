import React, { useState, useCallback, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Page,
  Layout,
  Card,
  IndexTable,
  TextField,
  Modal,
  TextContainer,
  Toast
} from '@shopify/polaris';

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
  const [data, setData] = useState(
    defaultRegions.map((region, index) => ({ id: index.toString(), region, price: '' }))
  );
  const [fileName, setFileName] = useState('');
  const [pendingUpdates, setPendingUpdates] = useState({});
  const [modalActive, setModalActive] = useState(false);
  const [toastContent, setToastContent] = useState(null);

  // File input change handler
  const handleFile = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    console.log('File received:', file.name);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const workbook = XLSX.read(evt.target.result, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        console.log('Parsed rows:', rows);
        const updates = {};
        rows.forEach(([region, price]) => {
          if (
            typeof region === 'string' && (typeof price === 'number' || typeof price === 'string') &&
            region.trim().toUpperCase() !== 'REGION'
          ) {
            updates[region.trim().toUpperCase()] = price;
          }
        });
        const validKeys = Object.keys(updates).filter(key => defaultRegions.includes(key));
        console.log('Valid region keys:', validKeys);
        if (!validKeys.length) {
          setToastContent('Invalid file format. Please upload the correct BRT Excel file.');
          return;
        }
        setPendingUpdates(updates);
        setModalActive(true);
      } catch (error) {
        console.error('Error parsing file:', error);
        setToastContent('Error reading Excel file. Please try again.');
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  // Apply Excel updates
  const applyUpdates = useCallback(() => {
    console.log('Applying updates:', pendingUpdates);
    setData(prev => prev.map(row => ({
      ...row,
      price: pendingUpdates[row.region] ?? row.price
    })));
    setModalActive(false);
    setPendingUpdates({});
  }, [pendingUpdates]);

  // Handle manual edits
  const handleChange = useCallback((index, _, value) => {
    console.log(`Manual change at row ${index}:`, value);
    setData(prev => {
      const copy = [...prev];
      copy[index].price = value;
      return copy;
    });
  }, []);

  // Table row markup
  const rowMarkup = useMemo(() =>
    data.map(({ id, region, price }, index) => (
      <IndexTable.Row key={id} id={id} position={index}>
        <IndexTable.Cell>{region}</IndexTable.Cell>
        <IndexTable.Cell>
          <TextField
            labelHidden
            type="number"
            value={price}
            onChange={value => handleChange(index, 'price', value)}
          />
        </IndexTable.Cell>
      </IndexTable.Row>
    )), [data, handleChange]
  );

  return (
    <>
      <Page
        title="BRT Shipping Region Editor"
        primaryAction={{ content: 'Save Changes', onAction: () => console.log('📦 Final data:', data) }}
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
                <TextContainer>
                  <p>This will overwrite the table values based on the uploaded file. Continue?</p>
                </TextContainer>
              </Modal.Section>
            </Modal>

            <Card>
              <IndexTable
                resourceName={{ singular: 'row', plural: 'rows' }}
                itemCount={data.length}
                selectable={false}
                headings={[{ title: 'Region' }, { title: 'Price for 100 KG' }]}
              >
                {rowMarkup}
              </IndexTable>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
      {toastContent && <Toast content={toastContent} onDismiss={() => setToastContent(null)} />}
    </>
  );
}
