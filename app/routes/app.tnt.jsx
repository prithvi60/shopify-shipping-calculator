import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Frame, Page, Layout, Card, FormLayout,
  TextField, IndexTable, Modal, Toast, TextContainer, Button, Select, Banner,
  BlockStack
} from '@shopify/polaris';
import { useFetcher } from '@remix-run/react';

export default function TntRateEditorV2() {
  const fetcher = useFetcher();
  const initialDataRef = useRef(null);

  // Initialize data with a single empty row, allowing for dynamic additions/imports.
  const [data, setData] = useState([{ weight: '', price: '' }]);

  const [courierName, setCourierName] = useState('');
  const [courierDescription, setCourierDesc] = useState('');
  const [config, setConfig] = useState({
    dryIceCostPerKg: '', dryIceVolumePerKg: '',
    freshIcePerDay: '', frozenIcePerDay: '',
    wineSurcharge: '', volumetricDivisor: '',
    fuelSurchargePct: '', vatPct: ''
  });
  // Transit days entries
  const [transitDaysEntries, setTransitDaysEntries] = useState([{ zoneType: 'COUNTRY', name: '', day: '' }]);

  // Separate pending states for rates and transit days from Excel uploads
  const [pendingRates, setPendingRates] = useState([]);
  const [pendingTransitDays, setPendingTransitDays] = useState([]);
  const [fileName, setFileName] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState(null);

  // Memoized options for the Zone Type dropdown
  const zoneTypeOptions = useMemo(() => ([
    { label: 'ZIP', value: 'ZIP' },
    { label: 'City', value: 'CITY' },
    { label: 'Province', value: 'PROVINCE' },
    { label: 'Region', value: 'REGION' },
    { label: 'Country', value: 'COUNTRY' },
  ]), []);

  // Fetch initial data from the NEW JSON-based API
  useEffect(() => { fetcher.load('/api/tnt') }, []);

  // Debug incoming fetcher data
  useEffect(() => {
    if (fetcher.data) console.log('⚙️ JSON API fetch response:', fetcher.data);
  }, [fetcher.data]);

  // Populate form & table after data is fetched
  useEffect(() => {
    if (!fetcher.data) return;
    const { config: cfg = {}, rates = [] } = fetcher.data;

    // Set courier details and configuration
    setCourierName(cfg.name || '');
    setCourierDesc(cfg.description || '');
    setConfig({
      dryIceCostPerKg: String(cfg.dryIceCostPerKg ?? ''),
      dryIceVolumePerKg: String(cfg.dryIceVolumePerKg ?? ''),
      freshIcePerDay: String(cfg.freshIcePerDay ?? ''),
      frozenIcePerDay: String(cfg.frozenIcePerDay ?? ''),
      wineSurcharge: String(cfg.wineSurcharge ?? ''),
      volumetricDivisor: String(cfg.volumetricDivisor ?? ''),
      fuelSurchargePct: String(cfg.fuelSurchargePct ?? ''),
      vatPct: String(cfg.vatPct ?? ''),
    });

    // Populate transitDaysEntries from fetched data
    if (cfg.transitDaysEntries && Array.isArray(cfg.transitDaysEntries) && cfg.transitDaysEntries.length > 0) {
      setTransitDaysEntries(cfg.transitDaysEntries.map(entry => ({
        zoneType: entry.zoneType,
        name: String(entry.name ?? ''),
        days: String(entry.days ?? ''),
      })));
    } else {
      setTransitDaysEntries([{ zoneType: 'COUNTRY', name: '', days: '' }]);
    }

    // Set rates data
    setData(rates.length ? rates : [{ weight: '', price: '' }]);

    // Store initial data for change detection
    initialDataRef.current = {
      courierName: cfg.name || '',
      courierDescription: cfg.description || '',
      config: {
        dryIceCostPerKg: String(cfg.dryIceCostPerKg ?? ''),
        dryIceVolumePerKg: String(cfg.dryIceVolumePerKg ?? ''),
        freshIcePerDay: String(cfg.freshIcePerDay ?? ''),
        frozenIcePerDay: String(cfg.frozenIcePerDay ?? ''),
        wineSurcharge: String(cfg.wineSurcharge ?? ''),
        volumetricDivisor: String(cfg.volumetricDivisor ?? ''),
        fuelSurchargePct: String(cfg.fuelSurchargePct ?? ''),
        vatPct: String(cfg.vatPct ?? ''),
      },
      transitDaysEntries: cfg.transitDaysEntries ? cfg.transitDaysEntries.map(entry => ({
        zoneType: entry.zoneType,
        name: String(entry.name ?? ''),
        days: String(entry.days ?? ''),
      })) : [{ zoneType: 'COUNTRY', name: '', days: '' }],
      data: rates.length ? rates : [{ weight: '', price: '' }]
    };
  }, [fetcher.data]);

  // Show toast on save success and re-fetch
  useEffect(() => {
    if (fetcher.data?.success) {
      setToast('Saved successfully');
      fetcher.load('/api/tnt'); // Re-fetch from JSON API
    }
  }, [fetcher.data]);



  // Handle file upload for rates and transit days
  const handleFile = useCallback((e, type) => {
    const file = e.target.files[0];
    if (!file) {
      setToast('No file selected');
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        let raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (!raw.length) throw new Error('No data found in the Excel file.');

        if (type === 'rates') {
          raw = raw.slice(0, 11);
          const headerMap = Object.keys(raw[0] || {}).reduce((map, h) => {
            map[h.trim().toLowerCase()] = h;
            return map;
          }, {});

          const weightHdr = headerMap[Object.keys(headerMap).find(k => /weight/i.test(k)) || 'weight'] || 'weight';
          const priceHdr = headerMap[Object.keys(headerMap).find(k => /price/i.test(k)) || 'price'] || 'price';

          const rows = raw.map(r => ({
            weight: String(r[weightHdr] ?? '').trim(),
            price: String(r[priceHdr] ?? '').replace(',', '.').trim()
          }));
          setPendingRates(rows);
        } else if (type === 'transitDays') {
          const headerMap = Object.keys(raw[0] || {}).reduce((map, h) => {
            map[h.trim().toLowerCase()] = h;
            return map;
          }, {});

          const zoneTypeHdr = headerMap[Object.keys(headerMap).find(k => /zone.*type/i.test(k)) || 'zoneType'] || 'zoneType';
          const nameHdr = headerMap[Object.keys(headerMap).find(k => /name/i.test(k)) || 'name'] || 'name';
          const daysHdr = headerMap[Object.keys(headerMap).find(k => /days/i.test(k)) || 'days'] || 'days';

          const entries = raw.map(r => ({
            zoneType: String(r[zoneTypeHdr] ?? '').trim().toUpperCase(),
            name: String(r[nameHdr] ?? '').trim(),
            days: String(r[daysHdr] ?? '').trim(),
          }));
          setPendingTransitDays(entries);
        }
        setModalOpen(true);
      } catch (error) {
        console.error("Error parsing file:", error);
        setToast('Excel parsing failed. Ensure the file has correct columns.');
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  // Apply updates using the new JSON API
  const applyUpdates = useCallback(() => {
    const finalTransitDaysEntries = pendingTransitDays.length > 0 ? pendingTransitDays : transitDaysEntries;
    const finalRatesData = pendingRates.length > 0 ? pendingRates : data;

    setPendingRates([]);
    setPendingTransitDays([]);
    setModalOpen(false);

    // Prepare payload in format expected by JSON API
    const payload = {
      name: courierName.trim(),
      description: courierDescription.trim(),
      dryIceCostPerKg: parseFloat(config.dryIceCostPerKg) || 0,
      dryIceVolumePerKg: parseFloat(config.dryIceVolumePerKg) || 0,
      freshIcePerDay: parseFloat(config.freshIcePerDay) || 0,
      frozenIcePerDay: parseFloat(config.frozenIcePerDay) || 0,
      wineSurcharge: parseFloat(config.wineSurcharge) || 0,
      volumetricDivisor: parseInt(config.volumetricDivisor) || 5000,
      fuelSurchargePct: parseFloat(config.fuelSurchargePct) || 0,
      vatPct: parseFloat(config.vatPct) || 21,
      transitDaysEntries: finalTransitDaysEntries
        .filter(entry => entry.name && entry.name.trim() && entry.days && entry.days.trim()) // Filter out empty entries
        .map(entry => {
          const days = parseInt(entry.days, 10);
          console.log(`🔍 Frontend sending transit day: ${entry.name}, days: ${days} (from ${entry.days})`);
          return {
            zoneType: entry.zoneType,
            name: entry.name.trim(),
            days: isNaN(days) ? 0 : days,
          };
        }),
      rates: finalRatesData
    };

    console.log('JSON API Payload:', JSON.stringify(payload, null, 2));

    const form = new FormData();
    form.append('config', JSON.stringify(payload));
    form.append('rates', JSON.stringify(finalRatesData));
    fetcher.submit(form, { method: 'post', action: '/api/tnt' });
  }, [courierName, courierDescription, config, data, pendingRates, transitDaysEntries, pendingTransitDays]);

  // Handle manual cell editing
  const handleCell = useCallback((index, key, value) => {
    setData(currentData => {
      const newData = [...currentData];
      newData[index] = { ...newData[index], [key]: value };
      return newData;
    });
  }, []);

  // Handle config field editing
  const handleConfigField = useCallback((field, value) => {
    setConfig(currentConfig => ({ ...currentConfig, [field]: value }));
  }, []);

  // Handle transit day changes
  const handleTransitDayChange = useCallback((index, key, value) => {
    setTransitDaysEntries(currentEntries => {
      const newEntries = [...currentEntries];
      newEntries[index] = { ...newEntries[index], [key]: value };
      return newEntries;
    });
  }, []);

  // Add transit day entry
  const addTransitDayEntry = useCallback(() => {
    setTransitDaysEntries(currentEntries => [...currentEntries, { zoneType: 'COUNTRY', name: '', days: '' }]);
  }, []);

  // Remove transit day entry
  const removeTransitDayEntry = useCallback((index) => {
    setTransitDaysEntries(currentEntries => currentEntries.filter((_, i) => i !== index));
  }, []);

  // Handle discard changes
  const handleDiscard = useCallback(() => {
    console.log('🔍 Discard button clicked');
    if (!initialDataRef.current) {
      console.log('❌ No initial data available');
      return;
    }
    
    const initial = initialDataRef.current;
    console.log('🔄 Discarding changes, reverting to:', initial);
    
    setCourierName(initial.courierName);
    setCourierDesc(initial.courierDescription);
    setConfig(initial.config);
    setTransitDaysEntries(initial.transitDaysEntries);
    setData(initial.data);
    
    setToast('Changes discarded');
  }, []);

  // Handle save changes
  const handleSave = useCallback(() => {
    console.log('🔍 Save button clicked');
    setModalOpen(true);
  }, []);



  // Memoize table rows
  const rows = useMemo(() => data.map((r, i) => (
    <IndexTable.Row id={String(i)} key={i} position={i}>
      <IndexTable.Cell>
        <TextField labelHidden value={r.weight} onChange={v => handleCell(i, 'weight', v)} />
      </IndexTable.Cell>
      <IndexTable.Cell>
        <TextField labelHidden value={r.price} onChange={v => handleCell(i, 'price', v)} />
      </IndexTable.Cell>
    </IndexTable.Row>
  )), [data, handleCell]);

  return (
    <Frame>
      <Page title="TNT Settings & Rates" primaryAction={{
        content: 'Save All', onAction: () => setModalOpen(true)
      }}>
        {/* Save Bar for unsaved changes */}
        {(() => {
          const hasChanges = () => {
            if (!initialDataRef.current) return false;
            
            const current = {
              courierName,
              courierDescription,
              config,
              transitDaysEntries,
              data
            };
            
            const initial = initialDataRef.current;
            
            // Deep comparison of objects
            const isEqual = (obj1, obj2) => {
              if (obj1 === obj2) return true;
              if (typeof obj1 !== typeof obj2) return false;
              if (typeof obj1 !== 'object') return obj1 === obj2;
              if (obj1 === null || obj2 === null) return obj1 === obj2;
              
              const keys1 = Object.keys(obj1);
              const keys2 = Object.keys(obj2);
              
              if (keys1.length !== keys2.length) return false;
              
              return keys1.every(key => isEqual(obj1[key], obj2[key]));
            };
            
            return !isEqual(current, initial);
          };
          
          return hasChanges() ? (
            <div style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: '#f6f6f7',
              borderTop: '1px solid #c9cccf',
              padding: '12px 24px',
              zIndex: 1000,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ color: '#6d7175', fontWeight: 500 }}>
                Unsaved changes
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button onClick={handleDiscard} size="slim">
                  Discard
                </Button>
                <Button onClick={handleSave} primary size="slim">
                  Save
                </Button>
              </div>
            </div>
          ) : null;
        })()}
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
                  <TextField
                    key={k}
                    label={k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                    type="number"
                    value={v}
                    onChange={val => handleConfigField(k, val)}
                  />
                ))}
              </FormLayout>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card sectioned title="Transit Days">
              <TextContainer>Define transit days for different zone types. Upload an Excel file with 'zoneType', 'name', and 'days' columns.</TextContainer>
              <div style={{ marginBottom: '16px' }}>
                <input type="file" accept=".xls,.xlsx" onChange={e => handleFile(e, 'transitDays')} />
                {fileName && <TextContainer>Uploaded Transit Days: {fileName}</TextContainer>}
              </div>
              <div style={{ maxHeight: '800px', overflowY: 'auto', overflowX: "hidden" }}>
                <FormLayout>
                  {transitDaysEntries.map((entry, i) => (
                    <FormLayout.Group key={i}>
                      <Select
                        label="Zone Type"
                        labelHidden
                        options={zoneTypeOptions}
                        onChange={(value) => handleTransitDayChange(i, 'zoneType', value)}
                        value={entry.zoneType}
                      />
                      <TextField
                        label="Name"
                        labelHidden
                        value={entry.name}
                        onChange={(value) => handleTransitDayChange(i, 'name', value)}
                      />
                      <TextField
                        label="Days"
                        labelHidden
                        type="number"
                        value={entry.days}
                        onChange={(value) => handleTransitDayChange(i, 'days', value)}
                      />
                      <Button
                        onClick={() => removeTransitDayEntry(i)}
                        destructive
                        size="slim"
                      >
                        Remove
                      </Button>
                    </FormLayout.Group>
                  ))}
                </FormLayout>
                <div style={{ marginTop: '16px' }}>
                  <Button onClick={addTransitDayEntry} size="slim">
                    Add Transit Day Entry
                  </Button>
                </div>
              </div>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card sectioned>
              <TextContainer>Upload an Excel file (.xls, .xlsx) with 'weight' and 'price' columns to update rates. Only the first 11 rows will be processed.</TextContainer>
              <input type="file" accept=".xls,.xlsx" onChange={e => handleFile(e, 'rates')} />
              {fileName && <TextContainer>Uploaded Rates: {fileName}</TextContainer>}
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

        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Confirm Changes"
          primaryAction={{ content: 'Apply', onAction: applyUpdates }}
          secondaryActions={[{ content: 'Cancel', onAction: () => setModalOpen(false) }]}
        >
          <Modal.Section>
            <BlockStack>This will overwrite the current settings & rates. Proceed?</BlockStack>
          </Modal.Section>
        </Modal>

        {toast && <Toast content={toast} onDismiss={() => setToast(null)} />}
      </Page>
    </Frame>
  );
} 