import React, { useState, useCallback, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Frame,
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  IndexTable,
  Modal,
  Toast,
  TextContainer
} from '@shopify/polaris';
import { useFetcher } from '@remix-run/react';

export default function FedexRateEditor() {
  const fetcher = useFetcher();

  const zoneLabels = [
    'ZONA A','ZONA B','ZONA C',
    'ZONA D','ZONA E','ZONA F',
    'ZONA G','ZONA H','ZONA I'
  ];
  const zoneKeys = zoneLabels.map(l => l.replace(' ', '_'));

  // courier metadata
  const [courierName, setCourierName] = useState('');
  const [courierDescription, setCourierDescription] = useState('');

  // shipping config
  const [config, setConfig] = useState({
    dryIceCostPerKg:   '',
    dryIceVolumePerKg: '',
    freshIcePerDay:    '',
    frozenIcePerDay:   '',
    wineSurcharge:     '',
    volumetricDivisor: '',
    fuelSurchargePct:  '',
    vatPct:            ''
  });

  // rate table
  const [data, setData] = useState([{
    weight: '',
    ...Object.fromEntries(zoneKeys.map(z => [z, '']))
  }]);
  const [pending, setPending] = useState([]);
  const [fileName, setFileName] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState(null);

  // 1️⃣ load on mount
  useEffect(() => {
    fetcher.load('/api/fedex');
  }, []);

  // 2️⃣ log DB response to the browser console
  useEffect(() => {
    if (fetcher.data) {
      console.log('⚙️ DB fetch response:', fetcher.data);
    }
  }, [fetcher.data]);

  // 3️⃣ when loader finishes, populate form fields
  useEffect(() => {
    if (fetcher.type === 'done' && fetcher.data) {
      const { config: cfg = {}, rates = [] } = fetcher.data;
      setCourierName(cfg.name ?? '');
      setCourierDescription(cfg.description ?? '');
      setConfig({
        dryIceCostPerKg:   String(cfg.dryIceCostPerKg ?? ''),
        dryIceVolumePerKg: String(cfg.dryIceVolumePerKg ?? ''),
        freshIcePerDay:    String(cfg.freshIcePerDay ?? ''),
        frozenIcePerDay:   String(cfg.frozenIcePerDay ?? ''),
        wineSurcharge:     String(cfg.wineSurcharge ?? ''),
        volumetricDivisor: String(cfg.volumetricDivisor ?? ''),
        fuelSurchargePct:  String(cfg.fuelSurchargePct ?? ''),
        vatPct:            String(cfg.vatPct ?? '')
      });
      setData(rates.length
        ? rates
        : [{ weight: '', ...Object.fromEntries(zoneKeys.map(z => [z, ''])) }]
      );
    }
  }, [fetcher.data, fetcher.type]);

  // 4️⃣ toast on save
  useEffect(() => {
    if (fetcher.type === 'done' && fetcher.data?.success) {
      setToast('Saved successfully');
    }
  }, [fetcher.data, fetcher.type]);

  // Excel import
  const handleFile = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return setToast('No file selected');
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb    = XLSX.read(evt.target.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw   = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (!raw.length) throw new Error('No data');
        console.log('Excel headers:', Object.keys(raw[0]));

        const weightKey = Object.keys(raw[0]).find(h => /weight/i.test(h)) || 'weight';
        const rows = raw
          .filter(r => {
            const w = r[weightKey];
            if (typeof w === 'number') return true;
            if (typeof w === 'string') {
              const txt = w.replace(',', '.').trim();
              return /^\d+(\.\d+)?(-\d+(\.\d+)?)?$/.test(txt);
            }
            return false;
          })
          .map(r => {
            const rawWeight = r[weightKey];
            const weight = String(rawWeight).replace(',', '.').trim();
            const entry = { weight };
            zoneLabels.forEach(label => {
              entry[label.replace(' ','_')] = String(r[label] ?? '').trim();
            });
            return entry;
          });

        setPending(rows);
        setModalOpen(true);
      } catch (err) {
        console.error(err);
        setToast('Excel parsing failed. Check format.');
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  // Save handler
  const applyUpdates = useCallback(() => {
    setData(pending);
    setModalOpen(false);
    setPending([]);

    const numConfig = Object.entries(config).reduce((acc,[k,v])=>{
      const n = parseFloat(v);
      acc[k] = isNaN(n) ? 0 : n;
      return acc;
    }, {});

    const payload = {
      name:        courierName.trim(),
      description: courierDescription.trim(),
      ...numConfig,
      rates: pending
    };

    console.log('📤 Submitting payload:', payload);
    const form = new FormData();
    form.append('payload', JSON.stringify(payload));
    fetcher.submit(form, { method: 'post', action: '/api/fedex' });
  }, [courierName, courierDescription, config, pending]);

  // manual edits
  const handleCell = useCallback((i,key,val) => {
    setData(d => {
      const c = [...d];
      c[i] = { ...c[i], [key]: val };
      return c;
    });
  }, []);
  const handleConfigField = useCallback((f,v) => {
    setConfig(c => ({ ...c, [f]: v }));
  }, []);

  // render rows
  const rows = useMemo(() =>
    data.map((r,i) => (
      <IndexTable.Row id={String(i)} key={i} position={i}>
        <IndexTable.Cell>
          <TextField labelHidden value={r.weight} onChange={v => handleCell(i,'weight',v)} />
        </IndexTable.Cell>
        {zoneKeys.map(z => (
          <IndexTable.Cell key={z}>
            <TextField labelHidden value={r[z]} onChange={v => handleCell(i,z,v)} />
          </IndexTable.Cell>
        ))}
      </IndexTable.Row>
    ))
  , [data]);

  return (
    <Frame>
      <Page title="FedEx Settings & Rates" primaryAction={{ content:'Save All', onAction:applyUpdates }}>
        <Layout>
          <Layout.Section>
            <Card sectioned title="Courier Details">
              <FormLayout>
                <TextField label="Name" value={courierName} onChange={setCourierName} />
                <TextField
                  label="Description"
                  value={courierDescription}
                  onChange={setCourierDescription}
                  multiline
                />
              </FormLayout>
            </Card>
          </Layout.Section>
          <Layout.Section>
            <Card sectioned title="Shipping Config">
              <FormLayout>
                <TextField label="Dry Ice Cost/kg" type="number"
                  value={config.dryIceCostPerKg}
                  onChange={v => handleConfigField('dryIceCostPerKg',v)}
                />
                <TextField label="Dry Ice Volume/kg (m³)" type="number"
                  value={config.dryIceVolumePerKg}
                  onChange={v => handleConfigField('dryIceVolumePerKg',v)}
                />
                <TextField label="Fresh Ice/day (kg)" type="number"
                  value={config.freshIcePerDay}
                  onChange={v => handleConfigField('freshIcePerDay',v)}
                />
                <TextField label="Frozen Ice/day (kg)" type="number"
                  value={config.frozenIcePerDay}
                  onChange={v => handleConfigField('frozenIcePerDay',v)}
                />
                <TextField label="Wine Surcharge/bottle" type="number"
                  value={config.wineSurcharge}
                  onChange={v => handleConfigField('wineSurcharge',v)}
                />
                <TextField label="Volumetric Divisor" type="number"
                  value={config.volumetricDivisor}
                  onChange={v => handleConfigField('volumetricDivisor',v)}
                />
                <TextField label="Fuel Surcharge (%)" type="number"
                  value={config.fuelSurchargePct}
                  onChange={v => handleConfigField('fuelSurchargePct',v)}
                />
                <TextField label="VAT (%)" type="number"
                  value={config.vatPct}
                  onChange={v => handleConfigField('vatPct',v)}
                />
              </FormLayout>
            </Card>
          </Layout.Section>
          <Layout.Section>
            <Card sectioned>
              <input type="file" accept=".xls,.xlsx" onChange={handleFile} />
              {fileName && <TextContainer>Uploaded: {fileName}</TextContainer>}
              <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title="Confirm Import"
                primaryAction={{ content:'Apply', onAction:applyUpdates }}
                secondaryActions={[{ content:'Cancel', onAction:()=>setModalOpen(false) }]}
              >
                <Modal.Section>
                  <TextContainer>Overwrite current rate table?</TextContainer>
                </Modal.Section>
              </Modal>
            </Card>
          </Layout.Section>
          <Layout.Section>
            <Card>
              <IndexTable
                resourceName={{ singular:'row', plural:'rows' }}
                itemCount={data.length}
                selectable={false}
                headings={[
                  { title:'Weight (kg)' },
                  ...zoneKeys.map(z => ({ title:z.replace('_',' ') }))
                ]}
              >
                {rows}
              </IndexTable>
            </Card>
          </Layout.Section>
        </Layout>
        {toast && <Toast content={toast} onDismiss={() => setToast(null)} />}
      </Page>
    </Frame>
  );
}
