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
    
    // Only use loaded zone sets if they exist
    if (Object.keys(zs).length > 0) {
      console.log('Setting zone sets from loaded data:', zs);
      setZoneSets(zs);
    } else {
      console.log('No zone sets found in loaded data');
      setZoneSets({});
    }
    
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
        
        const newServices = [];
        
        wb.SheetNames.forEach(sheetName => {
          const sheet = wb.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
          
          if (data.length === 0) return;
          
          console.log('Processing sheet:', sheetName);
          console.log('Sample row:', data[0]);
          
          const headerMap = Object.keys(data[0] || {}).reduce((map, h) => {
            map[h.trim().toLowerCase()] = h;
            return map;
          }, {});
          
          console.log('Header map:', headerMap);
          
          const calcTypeHdr = headerMap['calculation type'] || 'Calculation Type';
          const weightMinHdr = headerMap['weight min'] || 'Weight Min';
          const weightMaxHdr = headerMap['weight max'] || 'Weight Max';
          const unitHdr = headerMap['unit'] || 'Unit';

          let serviceCode, serviceName, zoneSet;
          const sheetNameMatch = sheetName.match(/(.+) \((.+)\)/);
          if (sheetNameMatch) {
            serviceName = sheetNameMatch[1].trim();
            serviceCode = serviceName.replace(/ /g, '_').toUpperCase();
            zoneSet = sheetNameMatch[2].trim().toUpperCase();
          } else {
            serviceName = sheetName;
            serviceCode = sheetName.replace(/ /g, '_').toUpperCase();
            zoneSet = 'INTERNATIONAL'; // Default for FedEx
          }

          // Zone set mapping to handle zone set names
          const zoneSetMapping = {
            'INT': 'INTERNATIONAL',  // For INT PRIORITY EXPRESS
            'EU': 'EU',             // For EU PRIORITY EXPRESS, EU INTERNATIONAL PRIORITY, REGIONAL ECONOMY
            'IP': 'EU',             // Legacy mapping for backward compatibility
            'IE': 'INTERNATIONAL',  // Legacy mapping for backward compatibility
            'RE': 'EU'              // Legacy mapping for backward compatibility
          };

          // Map the zone set to the correct name
          zoneSet = zoneSetMapping[zoneSet] || zoneSet;

          console.log('Service info:', { serviceCode, serviceName, zoneSet });

          const fixedRates = [];
          const progressiveRates = [];
          const bulkRates = [];
          const tempFixedRatesByWeight = {};

          data.forEach((row, index) => {
            const calculationType = row[calcTypeHdr]?.trim().toUpperCase();
            const minWeightStr = String(row[weightMinHdr] || '0').trim();
            const maxWeightStr = String(row[weightMaxHdr] || '0').trim();
            const zoneRates = {};

            // Extract zone rates from all columns that start with ZONA
            Object.keys(row).forEach(col => {
                const cleanCol = col.trim().toUpperCase().replace(/ /g, '_');
                if (cleanCol.startsWith('ZONA_')) {
                    const rate = parseFloat(String(row[col] || '0').replace(',', '.'));
                    if (!isNaN(rate) && rate > 0) {
                        zoneRates[cleanCol] = rate;
                    }
                }
            });

            console.log(`Row ${index}:`, { calculationType, minWeightStr, maxWeightStr, zoneRates });

            if (Object.keys(zoneRates).length === 0) {
              console.log(`Row ${index}: No zone rates found, skipping`);
              return;
            }

            if (calculationType === 'FIXED') {
                const minWeight = parseFloat(minWeightStr.replace(',', '.'));
                const maxWeight = parseFloat(maxWeightStr.replace(',', '.'));
                if (!isNaN(minWeight) && !isNaN(maxWeight)) {
                  // For FIXED rates, store min and max weight for range calculation
                  const rateData = { 
                    minWeight, 
                    maxWeight, 
                    zoneRates 
                  };
                  fixedRates.push(rateData);
                  tempFixedRatesByWeight[minWeight] = zoneRates;
                  console.log(`Added fixed rate for weight range ${minWeight}-${maxWeight}:`, rateData);
                }
            } else if (calculationType === 'PROGRESSIVE') {
                const minWeight = parseFloat(minWeightStr.replace(',', '.'));
                const maxWeight = parseFloat(maxWeightStr.replace(',', '.'));
                const unitStr = String(row[unitHdr] || '0');
                const unit = parseFloat(unitStr.replace(/[^\d.,]/g, '').replace(',', '.'));
                
                if (!isNaN(minWeight) && !isNaN(maxWeight)) {
                  progressiveRates.push({
                      minWeight,
                      maxWeight,
                      unit,
                      baseWeight: minWeight,
                      baseRates: tempFixedRatesByWeight[minWeight] || {},
                      additionalRates: zoneRates,
                  });
                  console.log(`Added progressive rate for range ${minWeight}-${maxWeight}:`, zoneRates);
                }
            } else if (calculationType === 'MULTIPLIED') {
                const minWeight = parseFloat(minWeightStr.replace(',', '.'));
                const maxWeight = parseFloat(maxWeightStr.replace(',', '.'));
                
                if (!isNaN(minWeight) && !isNaN(maxWeight)) {
                  bulkRates.push({
                      minWeight,
                      maxWeight: maxWeight || 99999,
                      perKgRates: zoneRates,
                  });
                  console.log(`Added bulk rate for range ${minWeight}-${maxWeight}:`, zoneRates);
                }
            }
          });
            
          console.log('Parsed rates:', { fixedRates: fixedRates.length, progressiveRates: progressiveRates.length, bulkRates: bulkRates.length });
            
          if (fixedRates.length > 0 || progressiveRates.length > 0 || bulkRates.length > 0) {
              newServices.push({
                code: serviceCode,
                name: serviceName,
                description: `${serviceName} service`,
                isActive: true,
                zoneSet,
                transitDays: serviceCode.includes('EXPRESS') ? 1 : serviceCode.includes('PRIORITY') ? 2 : 5,
                pricingStructure: {
                  fixedRates,
                  progressiveRates,
                  bulkRates
                }
              });
              console.log('Added service:', serviceCode);
            }
        });

        console.log('Total services parsed:', newServices.length);
        console.log('Sample service:', newServices[0]);

        // Process zone sets for imported services
        processZoneSetsFromServices(newServices);

        // Validate the imported data
        validateImportedData(newServices);

        if (newServices.length > 0) {
          setPending(newServices);
          setModalOpen(true);
        } else {
          setToast('No valid pricing data found in Excel file.');
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
    
    // Use zone sets from state if available, otherwise use empty object
    const currentZoneSets = Object.keys(zoneSets).length > 0 ? zoneSets : {};
    
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
  }, [courierName, courierDescription, config, services, pending, zoneSets]);

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



  // Get current service for editing
  const currentService = useMemo(() => {
    return services.find(s => s.code === selectedService);
  }, [services, selectedService]);

  const currentServiceIndex = useMemo(() => {
    return services.findIndex(s => s.code === selectedService);
  }, [services, selectedService]);

  // Function to process zone sets from services
  const processZoneSetsFromServices = useCallback((services) => {
    // Extract zone sets from services
    const zoneSets = {};
    
    services.forEach(service => {
      if ((service.zoneSet === 'EU' || service.zoneSet === 'INTERNATIONAL') && service.pricingStructure) {
        // Create zone set if it doesn't exist
        const targetZoneSet = service.zoneSet;
        if (!zoneSets[targetZoneSet]) {
          zoneSets[targetZoneSet] = { zones: [] };
        }
        
        // Extract zones from pricing structure
        const zones = new Set();
        service.pricingStructure.fixedRates?.forEach(rate => {
          Object.keys(rate.zoneRates || {}).forEach(zone => zones.add(zone));
        });
        service.pricingStructure.progressiveRates?.forEach(rate => {
          Object.keys(rate.additionalRates || {}).forEach(zone => zones.add(zone));
        });
        service.pricingStructure.bulkRates?.forEach(rate => {
          Object.keys(rate.perKgRates || {}).forEach(zone => zones.add(zone));
        });
        
        // Create zone objects
        zones.forEach(zoneCode => {
          const existingZone = zoneSets[targetZoneSet].zones.find(z => z.code === zoneCode);
          if (!existingZone) {
            // Create zone with default countries
            let countries = [];
            
            if (targetZoneSet === 'EU') {
              // EU zone mappings
              if (zoneCode === 'ZONA_R') {
                countries = ["AT", "FR", "DE", "MC", "SI", "IT"];
              } else if (zoneCode === 'ZONA_S') {
                countries = ["BE", "LU", "PT", "ES"];
              } else if (zoneCode === 'ZONA_T') {
                countries = ["BG", "PL", "CZ", "SK", "RO", "HU"];
              } else if (zoneCode === 'ZONA_U') {
                countries = ["HR", "DK", "EE", "FI", "GR", "IE", "LV", "LT", "SE", "NO", "IS"];
              } else if (zoneCode === 'ZONA_V') {
                countries = ["AL", "BY", "BA", "CY", "GI", "MK", "MT", "MD", "ME", "RS"];
              } else if (zoneCode === 'ZONA_W') {
                countries = ["LI", "CH"];
              } else if (zoneCode === 'ZONA_X') {
                countries = ["GB"];
              }
            } else if (targetZoneSet === 'INTERNATIONAL') {
              // INTERNATIONAL zone mappings
              if (zoneCode === 'ZONA_A') {
                countries = ["CA", "US"];
              } else if (zoneCode === 'ZONA_B') {
                countries = ["KH", "KR", "PH", "ID", "LA", "MO", "MY", "TH", "TW", "VN", "TL"];
              } else if (zoneCode === 'ZONA_C') {
                countries = ["DZ", "SA", "AM", "AZ", "BH", "BD", "BT", "EG", "AE", "GE", "IL", "JO", "KW", "LB", "LY", "MA", "NP", "OM", "PK", "QA", "TN"];
              } else if (zoneCode === 'ZONA_D') {
                countries = ["AI", "AG", "AW", "BS", "BB", "BZ", "BQ", "BR", "CL", "CO", "CR", "CW", "DM", "EC", "SV", "JM", "GD", "GP", "GT", "GY", "GF", "HT", "HN", "KY", "TC", "VI", "VG", "MQ", "MX", "MS", "NI", "PA", "PY", "PE", "PR", "DO", "KN", "LC", "SX", "MF", "VC", "ZA", "SR", "TT", "UY", "VE"];
              } else if (zoneCode === 'ZONA_E') {
                countries = ["AO", "BJ", "BW", "BF", "BI", "CV", "TD", "CG", "CI", "ER", "ET", "GA", "GM", "DJ", "GH", "GN", "GY", "IQ", "RE", "FJ", "KE", "LS", "LR", "MG", "MW", "MV", "ML", "MR", "MU", "MZ", "NA", "NE", "NG", "NC", "PG", "PF", "CD", "RW", "MP", "WS", "SN", "SC", "SZ", "TZ", "TG", "TO", "UG", "ZM", "ZW"];
              } else if (zoneCode === 'ZONA_F') {
                countries = ["CN", "HK"];
              } else if (zoneCode === 'ZONA_G') {
                countries = ["AU", "NZ"];
              } else if (zoneCode === 'ZONA_H') {
                countries = ["US"];
              } else if (zoneCode === 'ZONA_I') {
                countries = ["JP", "SG"];
              }
            }
            
            zoneSets[targetZoneSet].zones.push({
              code: zoneCode,
              name: zoneCode,
              description: `${zoneCode} zone`,
              countries
            });
          }
        });
      }
    });
    
    // Update the zone sets in the state
    if (Object.keys(zoneSets).length > 0) {
      setZoneSets(zoneSets);
    }
  }, []);

  // Debug function to validate imported data
  const validateImportedData = useCallback((services) => {
    console.log('=== VALIDATING IMPORTED DATA ===');
    services.forEach((service, index) => {
      console.log(`Service ${index + 1}: ${service.code} (${service.name})`);
      console.log(`  Zone Set: ${service.zoneSet}`);
      console.log(`  Fixed Rates: ${service.pricingStructure?.fixedRates?.length || 0}`);
      console.log(`  Progressive Rates: ${service.pricingStructure?.progressiveRates?.length || 0}`);
      console.log(`  Bulk Rates: ${service.pricingStructure?.bulkRates?.length || 0}`);
      
      if (service.pricingStructure?.fixedRates?.length > 0) {
        console.log(`  Sample Fixed Rate:`, service.pricingStructure.fixedRates[0]);
      }
      if (service.pricingStructure?.progressiveRates?.length > 0) {
        console.log(`  Sample Progressive Rate:`, service.pricingStructure.progressiveRates[0]);
      }
      if (service.pricingStructure?.bulkRates?.length > 0) {
        console.log(`  Sample Bulk Rate:`, service.pricingStructure.bulkRates[0]);
      }
    });
    console.log('=== END VALIDATION ===');
  }, []);

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
    
    // If the zone set doesn't exist, try to find zones from the pricing structure
    if (!zoneSets[set]) {
      console.log(`Zone set "${set}" not found in zoneSets:`, Object.keys(zoneSets));
      
      // Extract zones from the pricing structure if available
      if (currentService?.pricingStructure) {
        const zones = new Set();
        
        // Check fixed rates
        currentService.pricingStructure.fixedRates?.forEach(rate => {
          Object.keys(rate.zoneRates || {}).forEach(zone => zones.add(zone));
        });
        
        // Check progressive rates
        currentService.pricingStructure.progressiveRates?.forEach(rate => {
          Object.keys(rate.additionalRates || {}).forEach(zone => zones.add(zone));
        });
        
        // Check bulk rates
        currentService.pricingStructure.bulkRates?.forEach(rate => {
          Object.keys(rate.perKgRates || {}).forEach(zone => zones.add(zone));
        });
        
        console.log('Extracted zones from pricing structure:', Array.from(zones));
        return Array.from(zones).sort();
      }
      
      // Return empty array if no zones found
      return [];
    }
    
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
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <Button onClick={() => {
                            console.log('Current services:', services);
                            console.log('Current zone sets:', zoneSets);
                            validateImportedData(services);
                          }}>
                            Debug Data
                          </Button>
                          <Banner status="info">
                            <p>Pricing data is imported from Excel files. Use the Excel Import tab to add new pricing structures.</p>
                          </Banner>
                        </div>
                      </div>

                      {services.length > 0 ? (
                        <>
                          <DataTable
                            columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                            headings={['Service Code', 'Service Name', 'Zone Set', 'Transit Days', 'Pricing Structure']}
                            rows={services.map(service => {
                              const pricingStructure = service.pricingStructure || {};
                              const totalRates = (pricingStructure.fixedRates?.length || 0) + 
                                               (pricingStructure.progressiveRates?.length || 0) + 
                                               (pricingStructure.bulkRates?.length || 0);
                              return [
                                service.code || 'N/A',
                                service.name || 'N/A',
                                service.zoneSet || 'N/A',
                                String(service.transitDays || 'N/A'),
                                `${totalRates} rates (${pricingStructure.fixedRates?.length || 0}F/${pricingStructure.progressiveRates?.length || 0}P/${pricingStructure.bulkRates?.length || 0}B)`
                              ];
                            })}
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

                            {/* Debug Information */}
                            <div style={{ 
                              padding: '12px', 
                              backgroundColor: '#f6f6f7', 
                              borderRadius: '6px', 
                              fontSize: '12px',
                              fontFamily: 'monospace'
                            }}>
                              <strong>Debug Info:</strong><br/>
                              Service Code: {currentService.code}<br/>
                              Zone Set: {currentService.zoneSet}<br/>
                              Zone Sets Available: {Object.keys(zoneSets).join(', ')}<br/>
                              Fixed Rates: {currentService.pricingStructure?.fixedRates?.length || 0}<br/>
                              Progressive Rates: {currentService.pricingStructure?.progressiveRates?.length || 0}<br/>
                              Bulk Rates: {currentService.pricingStructure?.bulkRates?.length || 0}<br/>
                              Available Zones: {zoneSetCodes.join(', ')}<br/>
                              Zone Count: {zoneSetCodes.length}
                            </div>

                            <h4 style={headingStyles.h4}>Pricing Structure</h4>

                            {/* Fixed Rates Matrix View */}
                            {currentService?.pricingStructure?.fixedRates?.length > 0 && (
                              <div style={{ overflowX: 'auto', marginTop: '20px' }}>
                                <h4 style={{ ...headingStyles.h4, marginTop: '1rem' }}>Fixed Rates Matrix</h4>
                                <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
                                  <thead>
                                    <tr>
                                      <th style={matrixCellStyle}>Weight Range (kg)</th>
                                      {zoneSetCodes.map(zone => (
                                        <th key={zone} style={matrixCellStyle}>{zone.replace('_', ' ')}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {currentService.pricingStructure.fixedRates.map((rate, idx) => (
                                      <tr key={idx}>
                                        <td style={matrixCellStyle}>
                                          {`${rate.minWeight} - ${rate.maxWeight}`}
                                        </td>
                                        {zoneSetCodes.map(zone => (
                                          <td key={zone} style={matrixCellStyle}>
                                            {rate.zoneRates?.[zone] !== undefined ? rate.zoneRates[zone].toFixed(2) : '-'}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* Progressive Rates Matrix View */}
                            {currentService?.pricingStructure?.progressiveRates?.length > 0 && (
                              <div style={{ overflowX: 'auto', marginTop: '20px' }}>
                                <h4 style={{ ...headingStyles.h4, marginTop: '1rem' }}>Progressive Rates Matrix</h4>
                                <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
                                  <thead>
                                    <tr>
                                      <th style={matrixCellStyle}>Weight Range (kg)</th>
                                      <th style={matrixCellStyle}>Unit (kg)</th>
                                      {zoneSetCodes.map(zone => (
                                        <th key={zone} style={matrixCellStyle}>{zone.replace('_', ' ')}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {currentService.pricingStructure.progressiveRates.map((rate, idx) => (
                                      <tr key={idx}>
                                        <td style={matrixCellStyle}>{`${rate.minWeight} - ${rate.maxWeight}`}</td>
                                        <td style={matrixCellStyle}>{rate.unit}</td>
                                        {zoneSetCodes.map(zone => (
                                          <td key={zone} style={matrixCellStyle}>
                                            {rate.additionalRates?.[zone] !== undefined ? rate.additionalRates[zone].toFixed(2) : '-'}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* Bulk Rates Matrix View */}
                            {currentService?.pricingStructure?.bulkRates?.length > 0 && (
                              <div style={{ overflowX: 'auto', marginTop: '20px' }}>
                                <h4 style={{ ...headingStyles.h4, marginTop: '1rem' }}>Bulk Rates Matrix</h4>
                                <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
                                  <thead>
                                    <tr>
                                      <th style={matrixCellStyle}>Weight Range (kg)</th>
                                      {zoneSetCodes.map(zone => (
                                        <th key={zone} style={matrixCellStyle}>{zone.replace('_', ' ')}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {currentService.pricingStructure.bulkRates.map((rate, idx) => (
                                      <tr key={idx}>
                                        <td style={matrixCellStyle}>{`${rate.minWeight} - ${rate.maxWeight}`}</td>
                                        {zoneSetCodes.map(zone => (
                                          <td key={zone} style={matrixCellStyle}>
                                            {rate.perKgRates?.[zone] !== undefined ? rate.perKgRates[zone].toFixed(2) : '-'}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* Summary of pricing structure */}
                            <div style={{ 
                              padding: '16px', 
                              backgroundColor: '#f6f6f7', 
                              borderRadius: '8px', 
                              marginTop: '16px' 
                            }}>
                              <h4 style={headingStyles.h4}>Pricing Structure Summary</h4>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                                <div>
                                  <strong>Fixed Rates:</strong> {currentService.pricingStructure?.fixedRates?.length || 0}
                                </div>
                                <div>
                                  <strong>Progressive Rates:</strong> {currentService.pricingStructure?.progressiveRates?.length || 0}
                                </div>
                                <div>
                                  <strong>Bulk Rates:</strong> {currentService.pricingStructure?.bulkRates?.length || 0}
                                </div>
                                <div>
                                  <strong>Total Zones:</strong> {zoneSetCodes.length}
                                </div>
                              </div>
                              
                              {/* Weight Range Summary */}
                              {(() => {
                                const allRates = [
                                  ...(currentService.pricingStructure?.fixedRates || []),
                                  ...(currentService.pricingStructure?.progressiveRates || []),
                                  ...(currentService.pricingStructure?.bulkRates || [])
                                ];
                                
                                if (allRates.length > 0) {
                                  const weights = allRates.flatMap(rate => {
                                    if (rate.minWeight !== undefined && rate.maxWeight !== undefined) {
                                      return [rate.minWeight, rate.maxWeight]; // All rate types now use min/max
                                    }
                                    return [];
                                  });
                                  
                                  const minWeight = Math.min(...weights);
                                  const maxWeight = Math.max(...weights);
                                  
                                  return (
                                    <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #e1e3e5' }}>
                                      <strong>Weight Range:</strong> {minWeight} - {maxWeight} kg
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </div>
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
                        <Banner status="info">
                          <p>No zone sets configured. Zone sets will be created when you import services from Excel files or configure them manually.</p>
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
