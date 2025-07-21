import React, { useState, useCallback, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Frame, Page, Layout, Card, FormLayout,
  TextField, IndexTable, Modal, Toast, TextContainer
} from '@shopify/polaris';
import { useFetcher } from '@remix-run/react';

export default function TntRateEditor() {
  const fetcher = useFetcher();

  // Initialize data with a single empty row, allowing for dynamic additions/imports.
  const [data, setData] = useState([{ weight: '', price: '' }]);

  const [courierName, setCourierName] = useState('');
  const [courierDescription, setCourierDesc] = useState('');
  const [config, setConfig] = useState({
    dryIceCostPerKg:'', dryIceVolumePerKg:'',
    freshIcePerDay:'', frozenIcePerDay:'',
    wineSurcharge:'', volumetricDivisor:'',
    fuelSurchargePct:'', vatPct:'', transitDays:''
  });
  const [pending, setPending] = useState([]); // Stores data from uploaded file before confirmation
  const [fileName, setFileName] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState(null);

  // Fetch initial data from the API when the component mounts
  useEffect(() => { fetcher.load('/api/tnt') }, []);

  // Debug incoming fetcher data (for development purposes)
  useEffect(() => {
    if (fetcher.data) console.log('⚙️ DB fetch response:', fetcher.data);
  }, [fetcher.data]);

  // Populate form & table after data is fetched
  useEffect(() => {
    if (!fetcher.data) return;
    const { config: cfg = {}, rates = [] } = fetcher.data;

    // Set courier details and configuration
    setCourierName(cfg.name || '');
    setCourierDesc(cfg.description || '');
    setConfig({
      dryIceCostPerKg:   String(cfg.dryIceCostPerKg ?? ''),
      dryIceVolumePerKg: String(cfg.dryIceVolumePerKg ?? ''),
      freshIcePerDay:    String(cfg.freshIcePerDay ?? ''),
      frozenIcePerDay:   String(cfg.frozenIcePerDay ?? ''),
      wineSurcharge:     String(cfg.wineSurcharge ?? ''),
      volumetricDivisor: String(cfg.volumetricDivisor ?? ''),
      fuelSurchargePct:  String(cfg.fuelSurchargePct ?? ''),
      vatPct:            String(cfg.vatPct ?? ''),
      transitDays:       String(cfg.transitDays ?? ''),
    });

    // Directly use the fetched rates to populate the table.
    // If no rates are fetched, initialize with a single empty row.
    setData(rates.length ? rates : [{ weight: '', price: '' }]);
  }, [fetcher.data]); // Depend on fetcher.data to react to its changes

  // Show a toast message on save success, but DO NOT re-fetch data here.
  // The data state is already updated by applyUpdates.
  useEffect(() => {
    if (fetcher.data?.success) {
      setToast('Saved successfully');
      fetcher.load('/api/tnt')
    }
  }, [ fetcher.data]); // Depend on fetcher.type and fetcher.data for toast

  // Handles file upload and parses Excel data
  const handleFile = useCallback(e => {
    const file = e.target.files[0];
    if (!file) {
      setToast('No file selected');
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const wb    = XLSX.read(evt.target.result, { type:'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]]; // Get the first sheet
        let raw   = XLSX.utils.sheet_to_json(sheet, { defval:'' }); // Convert sheet to JSON

        if (!raw.length) throw new Error('No data found in the Excel file.');

        // ⭐ NEW: Limit to the first 14 rows
        raw = raw.slice(0, 11);

        // Build header map for flexible column matching (case-insensitive)
        const headerMap = Object.keys(raw[0] || {}).reduce((map, h) => {
          map[h.trim().toLowerCase()] = h;
          return map;
        }, {});

        // Find the actual header names for 'weight' and 'price'
        const weightHdr = headerMap[Object.keys(headerMap).find(k => /weight/i.test(k)) || 'weight'] || 'weight';
        const priceHdr = headerMap[Object.keys(headerMap).find(k => /price/i.test(k)) || 'price'] || 'price';


        // Map raw data to the desired format { weight: '...', price: '...' }
        // This will now accept whatever weight values are in the Excel file.
        const rows = raw.map(r => ({
          weight: String(r[weightHdr] ?? '').trim(),
          price: String(r[priceHdr] ?? '').replace(',', '.').trim() // Replace comma with dot for decimal parsing
        }));

        setPending(rows); // Store parsed rows in pending state for confirmation
        setModalOpen(true); // Open confirmation modal
      } catch (error) {
        console.error("Error parsing file:", error);
        setToast('Excel parsing failed. Ensure the file has "weight" and "price" columns.');
      }
    };
    reader.readAsArrayBuffer(file);
  }, []); // No dependency on 'data' or 'weightSteps' here, as it directly processes the file

  // Applies the pending updates (from Excel upload or manual edits)
  const applyUpdates = useCallback(() => {
    const newDataToSave = pending.length ? pending : data; // Use pending data if available, otherwise current data
    setData(newDataToSave); // Update the main data state immediately

    setPending([]); // Clear pending state
    setModalOpen(false); // Close the modal

    // Convert config values to numbers for payload
    const numericConfig = Object.entries(config).reduce((acc, [key, value]) => {
      acc[key] = parseFloat(value) || 0; // Parse to float, default to 0 if invalid
      return acc;
    }, {});

    // Transform rates data to match Prisma's expected structure for WeightBracket with nested Rate creation
    const formattedRatesForPrisma = newDataToSave.map(item => {
      let minWeightKg;
      let maxWeightKg;

      const weightStr = String(item.weight).trim();
      const priceVal = parseFloat(item.price) || 0;

      if (weightStr.includes('-')) {
        const parts = weightStr.split('-');
        minWeightKg = parseFloat(parts[0]);
        maxWeightKg = parseFloat(parts[1]);
      } else if (weightStr.startsWith('>')) {
        minWeightKg = parseFloat(weightStr.substring(1));
        maxWeightKg = 999999; // A sufficiently large number to represent "greater than"
      } else {
        // If it's a single number, treat min and max as that number
        minWeightKg = parseFloat(weightStr);
        maxWeightKg = parseFloat(weightStr);
      }

      // Ensure minWeightKg and maxWeightKg are valid numbers
      minWeightKg = isNaN(minWeightKg) ? 0 : minWeightKg;
      maxWeightKg = isNaN(maxWeightKg) ? 0 : maxWeightKg;

      return {
        minWeightKg: minWeightKg,
        maxWeightKg: maxWeightKg,
        // Nest the price within a 'create' object for the 'rates' relation
        rates: {
          create: {
            price: priceVal,
          }
        }
      };
    });

    // Prepare payload for submission
    const payload = {
      name:        courierName.trim(),
      description: courierDescription.trim(),
      ...numericConfig,
      rates:       formattedRatesForPrisma // Include the updated rates
    };

    const form = new FormData();
    form.append('config', JSON.stringify(payload));
    form.append('rates', JSON.stringify(formattedRatesForPrisma)); // Send rates separately if backend expects it
    fetcher.submit(form, { method:'post', action:'/api/tnt' });
  }, [courierName, courierDescription, config, data, pending]);

  // Handles manual cell editing for weight and price
  const handleCell = useCallback((index, key, value) => {
    setData(currentData => {
      const newData = [...currentData];
      newData[index] = { ...newData[index], [key]: value };
      return newData;
    });
  }, []);

  // Handles manual config field editing
  const handleConfigField = useCallback((field, value) => {
    setConfig(currentConfig => ({ ...currentConfig, [field]: value }));
  }, []);

  // Memoize rows for IndexTable to prevent unnecessary re-renders
  const rows = useMemo(() => data.map((r, i) => (
    <IndexTable.Row id={String(i)} key={i} position={i}>
      <IndexTable.Cell>
        {/* Weight field is now editable */}
        <TextField labelHidden value={r.weight} onChange={v => handleCell(i, 'weight', v)} />
      </IndexTable.Cell>
      <IndexTable.Cell>
        <TextField labelHidden value={r.price} onChange={v => handleCell(i, 'price', v)} />
      </IndexTable.Cell>
    </IndexTable.Row>
  )), [data, handleCell]); // Depend on 'data' and 'handleCell'

  return (
    <Frame>
      <Page title="TNT Settings & Rates" primaryAction={{
        content: 'Save All', onAction: () => setModalOpen(true) // Trigger save confirmation modal
      }}>
        <Layout>
          <Layout.Section>
            <Card sectioned title="Courier Details">
              <FormLayout>
                <TextField label="Name" value={courierName} onChange={setCourierName} />
                <TextField label="Description" value={courierDescription}
                  onChange={setCourierDesc} multiline />
              </FormLayout>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card sectioned title="Shipping Config">
              <FormLayout>
                {Object.entries(config).map(([k, v]) => (
                  <TextField key={k} label={k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())} // Format label for display
                    type="number" value={v} onChange={val => handleConfigField(k, val)} />
                ))}
              </FormLayout>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card sectioned>
              <TextContainer>Upload an Excel file (.xls, .xlsx) with 'weight' and 'price' columns to update rates. Only the first 14 rows will be processed.</TextContainer>
              <input type="file" accept=".xls,.xlsx" onChange={handleFile} />
              {fileName && <TextContainer>Uploaded: {fileName}</TextContainer>}
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <IndexTable
                resourceName={{ singular: 'row', plural: 'rows' }}
                itemCount={data.length}
                selectable={false}
                headings={[
                  { title: 'Weight (kg)' },
                  { title: 'Price (€)' }
                ]}
              >
                {rows}
              </IndexTable>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Confirmation Modal for saving changes */}
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Confirm Changes"
          primaryAction={{ content: 'Apply', onAction: applyUpdates }}
          secondaryActions={[{ content: 'Cancel', onAction: () => setModalOpen(false) }]}
        >
          <Modal.Section>
            <TextContainer>This will overwrite TNT settings & rates. Proceed?</TextContainer>
          </Modal.Section>
        </Modal>

        {/* Toast message for feedback */}
        {toast && <Toast content={toast} onDismiss={() => setToast(null)} />}
      </Page>
    </Frame>
  );
}
