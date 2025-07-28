import React, { useState, useCallback, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Frame,
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Modal,
  Toast,
  TextContainer,
  Select,
  Button,
  BlockStack,
  Tabs,
  Banner,
  List,
  DataTable,
  Badge
} from '@shopify/polaris';
import { useFetcher } from '@remix-run/react';

export default function FedexRateEditor() {
  const fetcher = useFetcher();

  // Add basic styles for headings to match Polaris design
  const headingStyles = {
    h3: {
      fontSize: '1.25rem',
      fontWeight: '600',
      margin: '0 0 1rem 0',
      color: '#202223'
    },
    h4: {
      fontSize: '1rem',
      fontWeight: '600', 
      margin: '0 0 0.5rem 0',
      color: '#202223'
    }
  };

  // Courier details
  const [courierName, setCourierName] = useState('');
  const [courierDescription, setCourierDesc] = useState('');

  // Shipping config
  const [config, setConfig] = useState({
    dryIceCostPerKg: '',
    dryIceVolumePerKg: '',
    freshIcePerDay: '',
    frozenIcePerDay: '',
    wineSurcharge: '',
    volumetricDivisor: '',
    fuelSurchargePct: '',
    vatPct: '',
    transitDays: ''
  });

  // New state for services and zone sets
  const [services, setServices] = useState([]);
  const [zoneSets, setZoneSets] = useState({});
  const [selectedService, setSelectedService] = useState('');
  const [selectedTab, setSelectedTab] = useState(0);
  const [selectedZoneTab, setSelectedZoneTab] = useState(0);

  // UI state
  const [pending, setPending] = useState([]);
  const [fileName, setFileName] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState(null);

  // Load configuration on mount
  useEffect(() => {
    fetcher.load('/api/fedex');
  }, []);

  // Handle incoming data
  useEffect(() => {
    if (!fetcher.data) return;
    
    const { config: cfg = {}, services: svc = [], zoneSets: zs = {} } = fetcher.data;

    console.log('Loading data from API:', { config: cfg, services: svc, zoneSets: zs });

    // Set courier & config
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
      transitDays: String(cfg.transitDays ?? '')
    });

    // Set services and zone sets
    setServices(svc);
    
    // Create default zone sets if none exist
    const defaultZoneSets = {
      INTERNATIONAL: {
        zones: [
          { code: "ZONA_A", name: "ZONA A", description: "North America", countries: ["CA", "US"] },
          { code: "ZONA_B", name: "ZONA B", description: "Asia Pacific", countries: ["KH", "KR", "PH", "ID", "LA", "MO", "MY", "TH", "TW", "VN", "TL"] },
          { code: "ZONA_C", name: "ZONA C", description: "Middle East & Africa", countries: ["DZ", "SA", "AM", "AZ", "BH", "BD", "BT", "EG", "AE", "GE", "IL", "JO", "KW", "LB", "LY", "MA", "NP", "OM", "PK", "QA", "TN"] },
          { code: "ZONA_D", name: "ZONA D", description: "Americas", countries: ["AI", "AG", "AW", "BS", "BB", "BZ", "BQ", "BR", "CL", "CO", "CR", "CW", "DM", "EC", "SV", "JM", "GD", "GP", "GT", "GY", "GF", "HT", "HN", "KY", "TC", "VI", "VG", "MQ", "MX", "MS", "NI", "PA", "PY", "PE", "PR", "DO", "KN", "LC", "SX", "MF", "VC", "ZA", "SR", "TT", "UY", "VE"] },
          { code: "ZONA_E", name: "ZONA E", description: "Africa", countries: ["AO", "BJ", "BW", "BF", "BI", "CV", "TD", "CG", "CI", "ER", "ET", "GA", "GM", "DJ", "GH", "GN", "GY", "IQ", "RE", "FJ", "KE", "LS", "LR", "MG", "MW", "MV", "ML", "MR", "MU", "MZ", "NA", "NE", "NG", "NC", "PG", "PF", "CD", "RW", "MP", "WS", "SN", "SC", "SZ", "TZ", "TG", "TO", "UG", "ZM", "ZW"] },
          { code: "ZONA_F", name: "ZONA F", description: "Asia Pacific", countries: ["CN", "HK"] },
          { code: "ZONA_G", name: "ZONA G", description: "Oceania", countries: ["AU", "NZ"] },
          { code: "ZONA_H", name: "ZONA H", description: "United States", countries: ["US"] },
          { code: "ZONA_I", name: "ZONA I", description: "Asia Pacific", countries: ["JP", "SG"] }
        ]
      },
      EU: {
        zones: [
          { code: "ZONA_R", name: "ZONA R", description: "Western Europe", countries: ["AT", "FR", "DE", "MC", "SI"] },
          { code: "ZONA_S", name: "ZONA S", description: "Western Europe", countries: ["BE", "LU", "PT", "ES"] },
          { code: "ZONA_T", name: "ZONA T", description: "Eastern Europe", countries: ["BG", "PL", "CZ", "SK", "RO", "HU"] },
          { code: "ZONA_U", name: "ZONA U", description: "Northern Europe", countries: ["HR", "DK", "EE", "FI", "GR", "IE", "LV", "LT", "SE"] },
          { code: "ZONA_V", name: "ZONA V", description: "Eastern Europe & Balkans", countries: ["AL", "BY", "BA", "CY", "GI", "IS", "MK", "MT", "MD", "ME", "NO", "RS"] },
          { code: "ZONA_W", name: "ZONA W", description: "Central Europe", countries: ["LI", "CH"] },
          { code: "ZONA_X", name: "ZONA X", description: "United Kingdom", countries: ["GB"] }
        ]
      }
    };
    
    // Use loaded zone sets if they exist, otherwise use defaults
    const finalZoneSets = Object.keys(zs).length > 0 ? zs : defaultZoneSets;
    console.log('Setting zone sets:', finalZoneSets);
    setZoneSets(finalZoneSets);
    
    // Select first service by default
    if (svc.length > 0 && !selectedService) {
      setSelectedService(svc[0].code);
    }
  }, [fetcher.data]);

  // Toast on save success
  useEffect(() => {
    if (fetcher.data?.success) {
      setToast('Configuration saved successfully');
      fetcher.load('/api/fedex');
    }
  }, [fetcher.data]);

  // Excel import handler
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
        const wb = XLSX.read(evt.target.result, { type: 'array' });
        
        // Process multiple sheets for different services
        const newServices = [];
        
        wb.SheetNames.forEach(sheetName => {
          const sheet = wb.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
          
          if (data.length === 0) return;
          
          console.log(`Sheet: ${sheetName}`);
          console.log('First 3 rows of data:', data.slice(0, 3));
          console.log('Available columns:', Object.keys(data[0] || {}));
          
          // Determine service type based on sheet name
          let serviceCode, serviceName, zoneSet;
          if (sheetName.includes('INT PRIORITY EXPRESS') || sheetName.includes('IPE')) {
            serviceCode = 'IPE_INT';
            serviceName = 'INT Priority Express';
            zoneSet = 'INTERNATIONAL';
          } else if (sheetName.includes('EU PRIORITY EXPRESS')) {
            serviceCode = 'IPE_EU';
            serviceName = 'EU Priority Express';
            zoneSet = 'EU';
          } else if (sheetName.includes('EU INTERNATIONAL PRIORITY')) {
            serviceCode = 'IP_EU';
            serviceName = 'EU International Priority';
            zoneSet = 'EU';
          } else if (sheetName.includes('INTERNATIONAL ECONOMY')) {
            serviceCode = 'IE_INT';
            serviceName = 'International Economy';
            zoneSet = 'INTERNATIONAL';
          } else if (sheetName.includes('REGIONAL ECONOMY')) {
            serviceCode = 'RE_EU';
            serviceName = 'Regional Economy';
            zoneSet = 'EU';
          } else {
            return; // Skip unknown sheets
          }

          // Parse pricing brackets from sheet data
          const brackets = data
            .filter(row => {
              // Get weight value from various possible column names
              const weightValue = row['WEIGHT'] || row['PESO (KG)'] || row['PESO'] || row['Weight'] || row['Peso'];
              if (!weightValue) return false;
              
              const weight = String(weightValue).trim();
              // Match pure numbers (including decimals) and exclude text like "addizionali", "Tariffa al kg", etc.
              return /^\d+([.,]\d+)?$/.test(weight) && !weight.includes('kg') && !weight.includes('Tariffa');
            })
            .map(row => {
              // Get weight value from various possible column names
              const weightValue = row['WEIGHT'] || row['PESO (KG)'] || row['PESO'] || row['Weight'] || row['Peso'];
              const weight = parseFloat(String(weightValue || '0').replace(',', '.'));
              const zoneRates = {};
              
              // Extract zone rates - check all columns for zone patterns
              console.log(`Processing row for ${serviceName}, available columns:`, Object.keys(row));
              
              Object.keys(row).forEach(col => {
                const cleanCol = col.trim();
                
                // Match zone patterns for both international and EU zones
                // Support both "ZONA A" format and single letter format
                const isInternationalZone = /^(\*\*)?ZONA [A-I](\*\*)?$/i.test(cleanCol) || /^[A-I]$/i.test(cleanCol);
                const isEUZone = /^(\*\*)?ZONA [R-X](\*\*)?$/i.test(cleanCol) || /^[R-X]$/i.test(cleanCol);
                
                // Only include zones that match the service's zone set
                const shouldInclude = (zoneSet === 'INTERNATIONAL' && isInternationalZone) ||
                                     (zoneSet === 'EU' && isEUZone);
                
                if (shouldInclude) {
                  const rate = parseFloat(String(row[col] || '0').replace(',', '.'));
                  if (!isNaN(rate) && rate > 0) {
                    // Clean up column name to match our zone codes
                    let zoneCode;
                    if (cleanCol.includes('ZONA')) {
                      zoneCode = cleanCol.replace(/\*\*/g, '').replace(' ', '_').toUpperCase();
                    } else {
                      // Single letter zone - convert to ZONA_X format
                      zoneCode = `ZONA_${cleanCol.toUpperCase()}`;
                    }
                    console.log(`Found zone rate: ${zoneCode} = ${rate} (from column: ${col})`);
                    zoneRates[zoneCode] = rate;
                  }
                }
              });
              
              return {
                minWeight: weight,
                maxWeight: weight,
                zoneRates
              };
            })
            .filter(bracket => Object.keys(bracket.zoneRates).length > 0); // Only include brackets with valid rates

          if (brackets.length > 0) {
            // Validate that brackets have zone rates
            const validBrackets = brackets.filter(b => Object.keys(b.zoneRates).length > 0);
            
            if (validBrackets.length > 0) {
              console.log(`${serviceName}: Found ${validBrackets.length} valid pricing brackets`);
              newServices.push({
                code: serviceCode,
                name: serviceName,
                description: `${serviceName} service`,
                isActive: true,
                zoneSet,
                transitDays: serviceCode.includes('EXPRESS') ? 1 : serviceCode.includes('PRIORITY') ? 2 : 5,
                pricingStructure: {
                  brackets: validBrackets
                }
              });
            } else {
              console.warn(`${serviceName}: No valid pricing brackets found (no zone rates)`);
            }
          } else {
            console.warn(`${serviceName}: No pricing brackets found in sheet data`);
          }
        });

        if (newServices.length > 0) {
          console.log('Parsed services from Excel:', newServices);
          
          // Create zone sets based on the imported services
          const newZoneSets = {};
          newServices.forEach(service => {
            if (service.zoneSet && !newZoneSets[service.zoneSet]) {
              // Create zone set based on the service type
              if (service.zoneSet === 'INTERNATIONAL') {
                newZoneSets[service.zoneSet] = {
                  zones: [
                    { code: "ZONA_A", name: "ZONA A", description: "North America", countries: ["CA", "US"] },
                    { code: "ZONA_B", name: "ZONA B", description: "Asia Pacific", countries: ["KH", "KR", "PH", "ID", "LA", "MO", "MY", "TH", "TW", "VN", "TL"] },
                    { code: "ZONA_C", name: "ZONA C", description: "Middle East & Africa", countries: ["DZ", "SA", "AM", "AZ", "BH", "BD", "BT", "EG", "AE", "GE", "IL", "JO", "KW", "LB", "LY", "MA", "NP", "OM", "PK", "QA", "TN"] },
                    { code: "ZONA_D", name: "ZONA D", description: "Americas", countries: ["AI", "AG", "AW", "BS", "BB", "BZ", "BQ", "BR", "CL", "CO", "CR", "CW", "DM", "EC", "SV", "JM", "GD", "GP", "GT", "GY", "GF", "HT", "HN", "KY", "TC", "VI", "VG", "MQ", "MX", "MS", "NI", "PA", "PY", "PE", "PR", "DO", "KN", "LC", "SX", "MF", "VC", "ZA", "SR", "TT", "UY", "VE"] },
                    { code: "ZONA_E", name: "ZONA E", description: "Africa", countries: ["AO", "BJ", "BW", "BF", "BI", "CV", "TD", "CG", "CI", "ER", "ET", "GA", "GM", "DJ", "GH", "GN", "GY", "IQ", "RE", "FJ", "KE", "LS", "LR", "MG", "MW", "MV", "ML", "MR", "MU", "MZ", "NA", "NE", "NG", "NC", "PG", "PF", "CD", "RW", "MP", "WS", "SN", "SC", "SZ", "TZ", "TG", "TO", "UG", "ZM", "ZW"] },
                    { code: "ZONA_F", name: "ZONA F", description: "Asia Pacific", countries: ["CN", "HK"] },
                    { code: "ZONA_G", name: "ZONA G", description: "Oceania", countries: ["AU", "NZ"] },
                    { code: "ZONA_H", name: "ZONA H", description: "United States", countries: ["US"] },
                    { code: "ZONA_I", name: "ZONA I", description: "Asia Pacific", countries: ["JP", "SG"] }
                  ]
                };
              } else if (service.zoneSet === 'EU') {
                newZoneSets[service.zoneSet] = {
                  zones: [
                    { code: "ZONA_R", name: "ZONA R", description: "Western Europe", countries: ["AT", "FR", "DE", "MC", "SI"] },
                    { code: "ZONA_S", name: "ZONA S", description: "Western Europe", countries: ["BE", "LU", "PT", "ES"] },
                    { code: "ZONA_T", name: "ZONA T", description: "Eastern Europe", countries: ["BG", "PL", "CZ", "SK", "RO", "HU"] },
                    { code: "ZONA_U", name: "ZONA U", description: "Northern Europe", countries: ["HR", "DK", "EE", "FI", "GR", "IE", "LV", "LT", "SE"] },
                    { code: "ZONA_V", name: "ZONA V", description: "Eastern Europe & Balkans", countries: ["AL", "BY", "BA", "CY", "GI", "IS", "MK", "MT", "MD", "ME", "NO", "RS"] },
                    { code: "ZONA_W", name: "ZONA W", description: "Central Europe", countries: ["LI", "CH"] },
                    { code: "ZONA_X", name: "ZONA X", description: "United Kingdom", countries: ["GB"] }
                  ]
                };
              }
            }
          });
          
          // Update zone sets state
          setZoneSets(prev => ({ ...prev, ...newZoneSets }));
          
          setPending(newServices);
          setModalOpen(true);
        } else {
          console.warn('No services parsed from Excel. Sheet names:', wb.SheetNames);
          setToast('No valid pricing data found in Excel file. Please check sheet names and data format.');
        }
      } catch (error) {
        console.error('Excel parsing error:', error);
        setToast('Excel parsing failed. Check format.');
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  // Save configuration
  const applyUpdates = useCallback(() => {
    const updatedServices = pending.length ? pending : services;
    
    // Ensure we always have zone sets, either from state or from the loaded config
    const currentZoneSets = Object.keys(zoneSets).length > 0 
      ? zoneSets 
      : fetcher.data?.zoneSets || {};
    
    const payload = {
      name: courierName.trim(),
      description: courierDescription.trim(),
      ...Object.entries(config).reduce((acc, [k, v]) => {
        acc[k] = parseFloat(v) || 0;
        return acc;
      }, {}),
      zoneSets: currentZoneSets
    };

    console.log('Saving configuration with zone sets:', currentZoneSets);
    console.log('Saving services:', updatedServices);

    const form = new FormData();
    form.append('config', JSON.stringify(payload));
    form.append('services', JSON.stringify(updatedServices));
    
    fetcher.submit(form, { method: 'post', action: '/api/fedex' });
    
    setServices(updatedServices);
    setPending([]);
    setModalOpen(false);
  }, [courierName, courierDescription, config, services, pending, zoneSets, fetcher.data]);

  // Handle config field changes
  const handleConfigField = useCallback((field, value) => {
    setConfig(c => ({ ...c, [field]: value }));
  }, []);

  // Handle service changes
  const updateService = useCallback((serviceIndex, updates) => {
    setServices(prev => prev.map((service, index) => 
      index === serviceIndex ? { ...service, ...updates } : service
    ));
  }, []);

  // Add new pricing bracket to service
  const addPricingBracket = useCallback((serviceIndex) => {
    const service = services[serviceIndex];
    const currentZoneSet = zoneSets[service.zoneSet];
    
    if (!currentZoneSet) return;
    
    const newBracket = {
      minWeight: 0,
      maxWeight: 0,
      zoneRates: Object.fromEntries(
        currentZoneSet.zones.map(zone => [zone.code, 0])
      )
    };
    
    updateService(serviceIndex, {
      pricingStructure: {
        ...service.pricingStructure,
        brackets: [...(service.pricingStructure?.brackets || []), newBracket]
      }
    });
  }, [services, zoneSets, updateService]);

  // Get current service for editing
  const currentService = useMemo(() => {
    return services.find(s => s.code === selectedService);
  }, [services, selectedService]);

  const currentServiceIndex = useMemo(() => {
    return services.findIndex(s => s.code === selectedService);
  }, [services, selectedService]);

  // Service options for selector
  const serviceOptions = useMemo(() => {
    return services.map(service => ({
      label: service.name,
      value: service.code
    }));
  }, [services]);

  // Tab configuration
  const tabs = [
    { id: 'config', content: 'Basic Configuration' },
    { id: 'services', content: 'Services & Pricing' },
    { id: 'zones', content: 'Zone Management' },
    { id: 'import', content: 'Excel Import' }
  ];

  const zoneSetCodes = useMemo(() => {
    const set = currentService?.zoneSet;
    return zoneSets[set]?.zones?.map(z => z.code) || [];
  }, [currentService, zoneSets]);
  
  const matrixCellStyle = {
    border: '1px solid #dfe3e8',
    padding: '8px',
    fontSize: '13px',
    textAlign: 'center',
    backgroundColor: '#fff'
  };

  return (
    <Frame>
      <Page
        title="FedEx Configuration"
        primaryAction={{
          content: 'Save Configuration',
          onAction: () => setModalOpen(true)
        }}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
                
                {/* Basic Configuration Tab */}
                {selectedTab === 0 && (
                  <Card sectioned title="some " >
                    <BlockStack gap="500">
                      <h3 style={headingStyles.h3}>Courier Details</h3>
                      <FormLayout>
                        <TextField
                          label="Courier Name"
                          value={courierName}
                          onChange={setCourierName}
                        />
                        <TextField
                          label="Description"
                          value={courierDescription}
                          onChange={setCourierDesc}
                          multiline={3}
                        />
                      </FormLayout>
                      
                      <h3 style={headingStyles.h3}>Shipping Configuration</h3>
                      <FormLayout>
                        <FormLayout.Group>
                          <TextField
                            label="Dry Ice Cost/kg (€)"
                            type="number"
                            value={config.dryIceCostPerKg}
                            onChange={v => handleConfigField('dryIceCostPerKg', v)}
                          />
                          <TextField
                            label="Dry Ice Volume/kg (m³)"
                            type="number"
                            value={config.dryIceVolumePerKg}
                            onChange={v => handleConfigField('dryIceVolumePerKg', v)}
                          />
                        </FormLayout.Group>
                        
                        <FormLayout.Group>
                          <TextField
                            label="Fresh Ice/day (kg)"
                            type="number"
                            value={config.freshIcePerDay}
                            onChange={v => handleConfigField('freshIcePerDay', v)}
                          />
                          <TextField
                            label="Frozen Ice/day (kg)"
                            type="number"
                            value={config.frozenIcePerDay}
                            onChange={v => handleConfigField('frozenIcePerDay', v)}
                          />
                        </FormLayout.Group>
                        
                        <FormLayout.Group>
                          <TextField
                            label="Wine Surcharge/bottle (€)"
                            type="number"
                            value={config.wineSurcharge}
                            onChange={v => handleConfigField('wineSurcharge', v)}
                          />
                          <TextField
                            label="Volumetric Divisor"
                            type="number"
                            value={config.volumetricDivisor}
                            onChange={v => handleConfigField('volumetricDivisor', v)}
                          />
                        </FormLayout.Group>
                        
                        <FormLayout.Group>
                          <TextField
                            label="Fuel Surcharge (%)"
                            type="number"
                            value={config.fuelSurchargePct}
                            onChange={v => handleConfigField('fuelSurchargePct', v)}
                          />
                          <TextField
                            label="VAT (%)"
                            type="number"
                            value={config.vatPct}
                            onChange={v => handleConfigField('vatPct', v)}
                          />
                        </FormLayout.Group>
                        
                        <TextField
                          label="Default Transit Days"
                          type="number"
                          value={config.transitDays}
                          onChange={v => handleConfigField('transitDays', v)}
                        />
                      </FormLayout>
                    </BlockStack>
                  </Card>
                )}

                {/* Services & Pricing Tab */}
                {selectedTab === 1 && (
                  <Card sectioned>
                    <BlockStack gap="500">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={headingStyles.h3}>Service Configuration</h3>
                        <Button onClick={() => addPricingBracket(currentServiceIndex)}>
                          Add Pricing Bracket
                        </Button>
                      </div>

                      {services.length > 0 ? (
                        <>
                          <DataTable
                            columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                            headings={['Service Code', 'Service Name', 'Zone Set', 'Transit Days', 'Pricing Brackets']}
                            rows={services.map(service => [
                              service.code || 'N/A',
                              service.name || 'N/A',
                              service.zoneSet || 'N/A',
                              String(service.transitDays || 'N/A'),
                              String(service.pricingStructure?.brackets?.length || 0)
                            ])}
                          />
                          
                          <Select
                            label="Select Service for Editing"
                            options={serviceOptions}
                            value={selectedService}
                            onChange={setSelectedService}
                          />
                        </>
                      ) : (
                        <Banner status="warning">
                          <p>No services configured. Please import services from Excel or configure them manually.</p>
                        </Banner>
                      )}

                      {currentService && (
                        <Card sectioned>
                          <BlockStack gap="400">
                            <FormLayout>
                              <FormLayout.Group>
                                <TextField
                                  label="Service Name"
                                  value={currentService.name}
                                  onChange={(value) => updateService(currentServiceIndex, { name: value })}
                                />
                                <TextField
                                  label="Transit Days"
                                  type="number"
                                  value={String(currentService.transitDays || '')}
                                  onChange={(value) => updateService(currentServiceIndex, { transitDays: parseInt(value) || 0 })}
                                />
                              </FormLayout.Group>
                              
                              <TextField
                                label="Description"
                                value={currentService.description}
                                onChange={(value) => updateService(currentServiceIndex, { description: value })}
                                multiline
                              />
                            </FormLayout>

                            <h4 style={headingStyles.h4}>Pricing Brackets</h4>

                            {/* Matrix View: Weight x Zones */}
                            {currentService?.pricingStructure?.brackets?.length > 0 && (
                              <div style={{ overflowX: 'auto', marginTop: '20px' }}>
                                <h4 style={{ ...headingStyles.h4, marginTop: '1rem' }}>Matrix View</h4>
                                <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
                                  <thead>
                                    <tr>
                                      <th style={matrixCellStyle}>Weight (kg)</th>
                                      {zoneSetCodes.map(zone => (
                                        <th key={zone} style={matrixCellStyle}>{zone.replace('_', ' ')}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {currentService.pricingStructure.brackets.map((bracket, idx) => (
                                      <tr key={idx}>
                                        <td style={matrixCellStyle}>{`${bracket.minWeight} - ${bracket.maxWeight}`}</td>
                                        {zoneSetCodes.map(zone => (
                                          <td key={zone} style={matrixCellStyle}>
                                            {bracket.zoneRates?.[zone] !== undefined ? bracket.zoneRates[zone].toFixed(2) : '-'}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            
                            {/* Summary table of all brackets */}
                            {currentService.pricingStructure?.brackets && currentService.pricingStructure.brackets.length > 0 && (
                              <DataTable
                                columnContentTypes={['text', 'text', 'text']}
                                headings={['Weight Range (kg)', 'Zones', 'Rate Range (€)']}
                                rows={currentService.pricingStructure.brackets.map((bracket, index) => {
                                  const zones = Object.keys(bracket.zoneRates || {});
                                  const rates = Object.values(bracket.zoneRates || {}).filter(r => r > 0);
                                  const minRate = rates.length > 0 ? Math.min(...rates) : 0;
                                  const maxRate = rates.length > 0 ? Math.max(...rates) : 0;
                                  
                                  return [
                                    `${bracket.minWeight || 0} - ${bracket.maxWeight || 0}`,
                                    zones.join(', '),
                                    rates.length > 0 ? `${minRate.toFixed(2)} - ${maxRate.toFixed(2)}` : 'N/A'
                                  ];
                                })}
                              />
                            )}

                            {/* Detailed bracket editing */}
                            {currentService.pricingStructure?.brackets?.map((bracket, bracketIndex) => (
                              <Card key={bracketIndex} sectioned>
                                <BlockStack gap="300">
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h4 style={headingStyles.h4}>Bracket {bracketIndex + 1}</h4>
                                    <Badge status="info">
                                      {Object.keys(bracket.zoneRates || {}).length} zones
                                    </Badge>
                                  </div>
                                  
                                  <FormLayout.Group>
                                    <TextField
                                      label="Min Weight (kg)"
                                      type="number"
                                      value={String(bracket.minWeight || '')}
                                      onChange={(value) => {
                                        const brackets = [...currentService.pricingStructure.brackets];
                                        brackets[bracketIndex] = {
                                          ...brackets[bracketIndex],
                                          minWeight: parseFloat(value) || 0
                                        };
                                        updateService(currentServiceIndex, {
                                          pricingStructure: { ...currentService.pricingStructure, brackets }
                                        });
                                      }}
                                    />
                                    <TextField
                                      label="Max Weight (kg)"
                                      type="number"
                                      value={String(bracket.maxWeight || '')}
                                      onChange={(value) => {
                                        const brackets = [...currentService.pricingStructure.brackets];
                                        brackets[bracketIndex] = {
                                          ...brackets[bracketIndex],
                                          maxWeight: parseFloat(value) || 0
                                        };
                                        updateService(currentServiceIndex, {
                                          pricingStructure: { ...currentService.pricingStructure, brackets }
                                        });
                                      }}
                                    />
                                  </FormLayout.Group>
                                  
                                  <h4 style={headingStyles.h4}>Zone Rates (€)</h4>
                                  <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                    gap: '16px'
                                  }}>
                                    {Object.entries(bracket.zoneRates || {}).map(([zoneCode, rate]) => (
                                      <TextField
                                        key={zoneCode}
                                        label={zoneCode.replace('_', ' ')}
                                        type="number"
                                        value={String(rate || '')}
                                        onChange={(value) => {
                                          const brackets = [...currentService.pricingStructure.brackets];
                                          brackets[bracketIndex] = {
                                            ...brackets[bracketIndex],
                                            zoneRates: {
                                              ...brackets[bracketIndex].zoneRates,
                                              [zoneCode]: parseFloat(value) || 0
                                            }
                                          };
                                          updateService(currentServiceIndex, {
                                            pricingStructure: { ...currentService.pricingStructure, brackets }
                                          });
                                        }}
                                      />
                                    ))}
                                  </div>
                                </BlockStack>
                              </Card>
                            ))}
                          </BlockStack>
                        </Card>
                      )}
                    </BlockStack>
                  </Card>
                )}

                {/* Zone Management Tab */}
                {selectedTab === 2 && (
                  <Card sectioned>
                    <BlockStack gap="500">
                      <h3 style={headingStyles.h3}>Zone Configuration</h3>
                      <Banner status="info">
                        <p>Zone configurations define which countries belong to which pricing zones. This affects how shipping rates are calculated.</p>
                      </Banner>
                      
                      <div style={{ fontSize: '12px', color: '#6B7280' }}>
                        Zone Sets: {Object.keys(zoneSets).length} | 
                        Total Zones: {Object.values(zoneSets).reduce((sum, set) => sum + (set.zones?.length || 0), 0)}
                      </div>
                      

                      
                      {Object.keys(zoneSets).length > 0 ? (
                        <>
                          <div style={{ padding: '10px', backgroundColor: '#f6f6f7', borderRadius: '4px', marginBottom: '10px' }}>
                            <strong>Debug Info:</strong> Found {Object.keys(zoneSets).length} zone sets: {Object.keys(zoneSets).join(', ')}
                          </div>
                          <Tabs
                            tabs={Object.keys(zoneSets).map(zoneSetName => ({
                              id: zoneSetName,
                              content: zoneSetName,
                              accessibilityLabel: `${zoneSetName} zones`
                            }))}
                            selected={selectedZoneTab}
                            onSelect={setSelectedZoneTab}
                          >
                            {Object.entries(zoneSets).map(([zoneSetName, zoneSet], index) => (
                              <div key={zoneSetName} style={{ display: selectedZoneTab === index ? 'block' : 'none' }}>
                                <Card sectioned>
                                  <BlockStack gap="400">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <h4 style={headingStyles.h4}>{zoneSetName} Zones</h4>
                                      <Badge status="info">{zoneSet.zones?.length || 0} zones</Badge>
                                    </div>
                                    
                                    {zoneSet.zones && zoneSet.zones.length > 0 ? (
                                      <DataTable
                                        columnContentTypes={['text', 'text', 'text', 'text']}
                                        headings={['Zone Code', 'Zone Name', 'Description', 'Countries']}
                                        rows={zoneSet.zones.map(zone => [
                                          zone.code || 'N/A',
                                          zone.name || 'N/A',
                                          zone.description || 'N/A',
                                          zone.countries ? zone.countries.join(', ') : 'N/A'
                                        ])}
                                      />
                                    ) : (
                                      <Banner status="warning">
                                        <p>No zones configured for {zoneSetName}.</p>
                                      </Banner>
                                    )}
                                    
                                    {/* Detailed zone information */}
                                    {zoneSet.zones && zoneSet.zones.length > 0 && (
                                      <BlockStack gap="400">
                                        <h4 style={headingStyles.h4}>Zone Details</h4>
                                        {zoneSet.zones.map(zone => (
                                          <Card key={zone.code} sectioned>
                                            <BlockStack gap="300">
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <strong>{zone.name || zone.code}</strong>
                                                <Badge status="success">{zone.countries?.length || 0} countries</Badge>
                                              </div>
                                              {zone.description && (
                                                <TextContainer>
                                                  <p>{zone.description}</p>
                                                </TextContainer>
                                              )}
                                              {zone.countries && zone.countries.length > 0 && (
                                                <div>
                                                  <p style={{ fontWeight: '600', marginBottom: '8px' }}>Countries:</p>
                                                  <div style={{ 
                                                    display: 'grid', 
                                                    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                                                    gap: '8px',
                                                    maxHeight: '200px',
                                                    overflowY: 'auto',
                                                    padding: '8px',
                                                    border: '1px solid #e1e3e5',
                                                    borderRadius: '4px',
                                                    backgroundColor: '#f6f6f7'
                                                  }}>
                                                    {zone.countries.map(country => (
                                                      <span key={country} style={{ 
                                                        fontSize: '12px',
                                                        padding: '2px 6px',
                                                        backgroundColor: '#ffffff',
                                                        border: '1px solid #d2d5db',
                                                        borderRadius: '3px',
                                                        display: 'inline-block'
                                                      }}>
                                                        {country}
                                                      </span>
                                                    ))}
                                                  </div>
                                                </div>
                                              )}
                                            </BlockStack>
                                          </Card>
                                        ))}
                                      </BlockStack>
                                    )}
                                  </BlockStack>
                                </Card>
                              </div>
                            ))}
                          </Tabs>
                        </>
                      ) : (
                        <Banner status="warning">
                          <p>No zone sets configured. Please configure zone sets in the basic configuration.</p>
                        </Banner>
                      )}
                    </BlockStack>
                  </Card>
                )}

                {/* Excel Import Tab */}
                {selectedTab === 3 && (
                  <Card sectioned>
                    <BlockStack gap="500">
                      <h3 style={headingStyles.h3}>Excel Import</h3>
                      <Banner status="info">
                        <p>Upload an Excel file with FedEx pricing data. The file should contain multiple sheets with service names (e.g., "INT PRIORITY EXPRESS", "EU PRIORITY EXPRESS").</p>
                      </Banner>
                      
                      <input
                        type="file"
                        accept=".xls,.xlsx"
                        onChange={handleFile}
                        style={{ padding: '10px', border: '1px dashed #ccc', borderRadius: '4px' }}
                      />
                      
                      {fileName && (
                        <TextContainer>
                          <p><strong>Uploaded:</strong> {fileName}</p>
                        </TextContainer>
                      )}
                    </BlockStack>
                  </Card>
                )}
                
              </Tabs>
            </Card>
          </Layout.Section>

          {/* Confirmation Modal */}
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Confirm Configuration Changes"
            primaryAction={{
              content: 'Apply Changes',
              onAction: applyUpdates
            }}
            secondaryActions={[{
              content: 'Cancel',
              onAction: () => setModalOpen(false)
            }]}
          >
            <Modal.Section>
              <BlockStack gap="300">
                <p>This will update the FedEx configuration with the following changes:</p>
                <List type="bullet">
                  <List.Item>Basic courier settings and shipping configuration</List.Item>
                  <List.Item>Service definitions and pricing structures</List.Item>
                  <List.Item>Zone mappings and country assignments</List.Item>
                  {pending.length > 0 && (
                    <List.Item><strong>Import {pending.length} new services from Excel</strong></List.Item>
                  )}
                </List>
                <p>Are you sure you want to proceed?</p>
              </BlockStack>
            </Modal.Section>
          </Modal>
        </Layout>

        {toast && (
          <Toast
            content={toast}
            onDismiss={() => setToast(null)}
          />
        )}
      </Page>
    </Frame>
  );
}
