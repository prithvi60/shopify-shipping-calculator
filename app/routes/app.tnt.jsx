// app/routes/TntRateEditor.jsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Frame, Page, Layout, Card, FormLayout,
  TextField, IndexTable, Modal, Toast, TextContainer
} from '@shopify/polaris';
import { useFetcher } from '@remix-run/react';

export default function TntRateEditor() {
  const fetcher = useFetcher();

  const zoneLabels = [
    'ZONA 1','ZONA 2','ZONA 3',
    'ZONA 4','ZONA 5','ZONA 6',
    'ZONA 7','ZONA 8','ZONA 9'
  ];
  const zoneKeys = zoneLabels.map(l => l.replace(/\s+/g,'_'));

  const [courierName, setCourierName]        = useState('');
  const [courierDescription, setCourierDesc] = useState('');
  const [config, setConfig] = useState({
    dryIceCostPerKg:'', dryIceVolumePerKg:'',
    freshIcePerDay:'', frozenIcePerDay:'',
    wineSurcharge:'', volumetricDivisor:'',
    fuelSurchargePct:'', vatPct:'', transitDays:''
  });

  const [data, setData]       = useState([{ weight:'', ...Object.fromEntries(zoneKeys.map(z=>[z,''])) }]);
  const [pending, setPending] = useState([]);
  const [fileName, setFileName]   = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast]         = useState(null);

  // 1️⃣ load on mount
  useEffect(()=>{ fetcher.load('/api/tnt') }, []);

  // 2️⃣ populate
  useEffect(()=>{
    if (fetcher.type==='done' && fetcher.data) {
      const { config: cfg={}, rates=[] } = fetcher.data;
      setCourierName(cfg.name||'');
      setCourierDesc(cfg.description||'');
      setConfig({
        dryIceCostPerKg:   String(cfg.dryIceCostPerKg),
        dryIceVolumePerKg: String(cfg.dryIceVolumePerKg),
        freshIcePerDay:    String(cfg.freshIcePerDay),
        frozenIcePerDay:   String(cfg.frozenIcePerDay),
        wineSurcharge:     String(cfg.wineSurcharge),
        volumetricDivisor: String(cfg.volumetricDivisor),
        fuelSurchargePct:  String(cfg.fuelSurchargePct),
        vatPct:            String(cfg.vatPct),
        transitDays:       String(cfg.transitDays),
      });
      setData(rates.length
        ? rates
        : [{ weight:'', ...Object.fromEntries(zoneKeys.map(z=>[z,''])) }]
      );
    }
  }, [fetcher]);

  // 3️⃣ toast on save
  useEffect(()=>{
    if (fetcher.type==='done' && fetcher.data?.success) {
      setToast('Saved successfully');
      fetcher.load('/api/tnt');
    }
  }, [fetcher]);

  // Excel import
  const handleFile = useCallback(e=>{
    const file = e.target.files[0];
    if (!file) { setToast('No file'); return; }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const wb    = XLSX.read(evt.target.result, { type:'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw   = XLSX.utils.sheet_to_json(sheet, { defval:'' });
        const headerMap = Object.keys(raw[0]||{}).reduce((m,h)=>{
          m[h.trim().toLowerCase()] = h; return m;
        }, {});
        const weightHdr = headerMap[ Object.keys(headerMap).find(k=>/weight/i.test(k)) ] || 'weight';
        const rows = raw.filter(r=>{
          const t = String(r[weightHdr]).replace(',', '.').trim();
          return /^\d+(\.\d+)?(-\d+(\.\d+)?)?$/.test(t);
        }).map(r=>{
          const wt = String(r[weightHdr]).replace(',', '.').trim();
          const entry = { weight: wt };
          zoneLabels.forEach(lbl=>{
            const key = lbl.trim().toLowerCase();
            const hdr = headerMap[key];
            entry[lbl.replace(' ','_')] = String(r[hdr]||'').trim();
          });
          return entry;
        });
        setPending(rows);
        setModalOpen(true);
      } catch {
        setToast('Parsing failed');
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  // Apply save or import
  const applyUpdates = useCallback(()=>{
    const newData = pending.length ? pending : data;
    setData(newData);
    setPending([]); setModalOpen(false);

    // sanitize config
    const num = Object.entries(config).reduce((a,[k,v])=>{
      a[k]=parseFloat(v)||0; return a;
    }, {});

    const payload = {
      name:        courierName.trim(),
      description: courierDescription.trim(),
      ...num,
      rates:       newData
    };

    const form = new FormData();
    form.append('config', JSON.stringify(payload));
    form.append('rates',  JSON.stringify(newData));
    fetcher.submit(form, { method:'post', action:'/api/tnt' });
  }, [courierName,courierDescription,config,data,pending]);

  const handleCell = useCallback((i,k,v)=>{
    setData(d=>{ const c=[...d]; c[i]={...c[i],[k]:v}; return c; });
  }, []);
  const handleConfigField = useCallback((f,v)=>{
    setConfig(c=>({...c,[f]:v}));
  }, []);

  const rows = useMemo(()=>data.map((r,i)=>(
    <IndexTable.Row id={String(i)} key={i} position={i}>
      <IndexTable.Cell>
        <TextField labelHidden value={r.weight}
          onChange={v=>handleCell(i,'weight',v)}/>
      </IndexTable.Cell>
      {zoneKeys.map(z=>(
        <IndexTable.Cell key={z}>
          <TextField labelHidden value={r[z]}
            onChange={v=>handleCell(i,z,v)}/>
        </IndexTable.Cell>
      ))}
    </IndexTable.Row>
  )), [data]);

  return (
    <Frame>
      <Page title="TNT Settings & Rates" primaryAction={{
        content:'Save All', onAction:()=>setModalOpen(true)
      }}>
        <Layout>
          <Layout.Section>
            <Card sectioned title="Courier Details">
              <FormLayout>
                <TextField label="Name" value={courierName} onChange={setCourierName}/>
                <TextField label="Description" value={courierDescription}
                  onChange={setCourierDesc} multiline/>
              </FormLayout>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card sectioned title="Shipping Config">
              <FormLayout>
                <TextField label="Dry Ice Cost/kg"      type="number"
                  value={config.dryIceCostPerKg}
                  onChange={v=>handleConfigField('dryIceCostPerKg',v)}/>
                <TextField label="Dry Ice Volume/kg (m³)" type="number"
                  value={config.dryIceVolumePerKg}
                  onChange={v=>handleConfigField('dryIceVolumePerKg',v)}/>
                <TextField label="Fresh Ice/day (kg)"   type="number"
                  value={config.freshIcePerDay}
                  onChange={v=>handleConfigField('freshIcePerDay',v)}/>
                <TextField label="Frozen Ice/day (kg)"  type="number"
                  value={config.frozenIcePerDay}
                  onChange={v=>handleConfigField('frozenIcePerDay',v)}/>
                <TextField label="Wine Surcharge/btl"   type="number"
                  value={config.wineSurcharge}
                  onChange={v=>handleConfigField('wineSurcharge',v)}/>
                <TextField label="Volumetric Divisor"   type="number"
                  value={config.volumetricDivisor}
                  onChange={v=>handleConfigField('volumetricDivisor',v)}/>
                <TextField label="Fuel Surcharge (%)"   type="number"
                  value={config.fuelSurchargePct}
                  onChange={v=>handleConfigField('fuelSurchargePct',v)}/>
                <TextField label="VAT (%)"              type="number"
                  value={config.vatPct}
                  onChange={v=>handleConfigField('vatPct',v)}/>
                <TextField label="Transit Days"         type="number"
                  value={config.transitDays}
                  onChange={v=>handleConfigField('transitDays',v)}/>
              </FormLayout>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card sectioned>
              <input type="file" accept=".xls,.xlsx" onChange={handleFile}/>
              {fileName && <TextContainer>Uploaded: {fileName}</TextContainer>}
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
                  ...zoneKeys.map(z=>({ title:z.replace('_',' ') }))
                ]}
              >
                {rows}
              </IndexTable>
            </Card>
          </Layout.Section>
        </Layout>

        <Modal
          open={modalOpen}
          onClose={()=>setModalOpen(false)}
          title="Confirm Changes"
          primaryAction={{ content:'Apply', onAction:applyUpdates }}
          secondaryActions={[{ content:'Cancel', onAction:()=>setModalOpen(false) }]}
        >
          <Modal.Section>
            <TextContainer>
              This will overwrite TNT settings & rates. Proceed?
            </TextContainer>
          </Modal.Section>
        </Modal>

        {toast && <Toast content={toast} onDismiss={()=>setToast(null)}/>}
      </Page>
    </Frame>
  );
}
