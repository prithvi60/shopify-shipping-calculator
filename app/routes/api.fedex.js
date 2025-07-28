// app/routes/api.fedex.js - Enhanced JSON-based FedEx API with multiple services
import { json } from '@remix-run/node';
import prisma from '../db.server';

// Get default FedEx configuration from the updated config file
const getDefaultFedexConfig = () => ({
  courierType: "FEDEX",
  version: "2.0",
  basicInfo: {
    name: "FedEx Express",
    description: "FedEx Express international shipping",
    isActive: true,
    supportedRegions: ["EU", "WORLDWIDE"]
  },
  shippingConfig: {
    dryIce: {
      costPerKg: 12.0,
      volumePerKg: 2.0
    },
    ice: {
      freshPerDay: 1.0,
      frozenPerDay: 2.0
    },
    surcharges: {
      wine: 3.5,
      fuel: {
        percentage: 15.0
      }
    },
    calculations: {
      volumetricDivisor: 5000,
      vatPercentage: 22.0
    },
    transitDays: 3
  },
  services: [
    {
      code: "IPE_INT",
      name: "INT Priority Express",
      description: "International Priority Express",
      isActive: true,
      zoneSet: "INTERNATIONAL",
      transitDays: 1,
      pricingStructure: {
        brackets: [
          {
            minWeight: 0.5,
            maxWeight: 0.5,
            zoneRates: {
              "ZONA_A": 23.05,
              "ZONA_B": 31.1,
              "ZONA_C": 26.72,
              "ZONA_D": 33.03,
              "ZONA_E": 37.61,
              "ZONA_F": 28.79,
              "ZONA_G": 34.95,
              "ZONA_H": 21.95,
              "ZONA_I": 31.1
            }
          }
        ]
      }
    }
  ],
  zoneSets: {
    INTERNATIONAL: {
      zones: [
        {
          code: "ZONA_A",
          name: "ZONA A",
          description: "North America",
          countries: ["CA", "US"]
        },
        {
          code: "ZONA_B", 
          name: "ZONA B",
          description: "Asia Pacific",
          countries: ["KH", "KR", "PH", "ID", "LA", "MO", "MY", "TH", "TW", "VN", "TL"]
        },
        {
          code: "ZONA_C",
          name: "ZONA C", 
          description: "Middle East & Africa",
          countries: ["DZ", "SA", "AM", "AZ", "BH", "BD", "BT", "EG", "AE", "GE", "IL", "JO", "KW", "LB", "LY", "MA", "NP", "OM", "PK", "QA", "TN"]
        },
        {
          code: "ZONA_D",
          name: "ZONA D",
          description: "Americas",
          countries: ["AI", "AG", "AW", "BS", "BB", "BZ", "BQ", "BR", "CL", "CO", "CR", "CW", "DM", "EC", "SV", "JM", "GD", "GP", "GT", "GY", "GF", "HT", "HN", "KY", "TC", "VI", "VG", "MQ", "MX", "MS", "NI", "PA", "PY", "PE", "PR", "DO", "KN", "LC", "SX", "MF", "VC", "ZA", "SR", "TT", "UY", "VE"]
        },
        {
          code: "ZONA_E",
          name: "ZONA E",
          description: "Africa",
          countries: ["AO", "BJ", "BW", "BF", "BI", "CV", "TD", "CG", "CI", "ER", "ET", "GA", "GM", "DJ", "GH", "GN", "GY", "IQ", "RE", "FJ", "KE", "LS", "LR", "MG", "MW", "MV", "ML", "MR", "MU", "MZ", "NA", "NE", "NG", "NC", "PG", "PF", "CD", "RW", "MP", "WS", "SN", "SC", "SZ", "TZ", "TG", "TO", "UG", "ZM", "ZW"]
        },
        {
          code: "ZONA_F",
          name: "ZONA F",
          description: "Asia Pacific",
          countries: ["CN", "HK"]
        },
        {
          code: "ZONA_G",
          name: "ZONA G",
          description: "Oceania",
          countries: ["AU", "NZ"]
        },
        {
          code: "ZONA_H",
          name: "ZONA H",
          description: "United States",
          countries: ["US"]
        },
        {
          code: "ZONA_I",
          name: "ZONA I",
          description: "Asia Pacific",
          countries: ["JP", "SG"]
        }
      ]
    },
    EU: {
      zones: [
        {
          code: "ZONA_R",
          name: "ZONA R",
          description: "Western Europe",
          countries: ["AT", "FR", "DE", "MC", "SI"]
        },
        {
          code: "ZONA_S",
          name: "ZONA S",
          description: "Western Europe",
          countries: ["BE", "LU", "PT", "ES"]
        },
        {
          code: "ZONA_T",
          name: "ZONA T",
          description: "Eastern Europe",
          countries: ["BG", "PL", "CZ", "SK", "RO", "HU"]
        },
        {
          code: "ZONA_U",
          name: "ZONA U",
          description: "Northern Europe",
          countries: ["HR", "DK", "EE", "FI", "GR", "IE", "LV", "LT", "SE"]
        },
        {
          code: "ZONA_V",
          name: "ZONA V",
          description: "Eastern Europe & Balkans",
          countries: ["AL", "BY", "BA", "CY", "GI", "IS", "MK", "MT", "MD", "ME", "NO", "RS"]
        },
        {
          code: "ZONA_W",
          name: "ZONA W",
          description: "Central Europe",
          countries: ["LI", "CH"]
        },
        {
          code: "ZONA_X",
          name: "ZONA X",
          description: "United Kingdom",
          countries: ["GB"]
        }
      ]
    }
  }
});

export const loader = async () => {
  try {
    // Find FedEx courier with JSON config
    const courier = await prisma.courier.findUnique({
      where: { name: 'FEDEX' }
    });

    const config = courier?.config || getDefaultFedexConfig();
    
    // Transform JSON config to format expected by UI
    const response = {
      config: {
        name: config.basicInfo?.name || "FedEx Express",
        description: config.basicInfo?.description || "FedEx Express international shipping",
        ...flattenShippingConfig(config.shippingConfig || {})
      },
      services: config.services || [],
      zoneSets: config.zoneSets || {},
      // For backward compatibility, also provide rates in the old format
      rates: formatServicesForLegacyUI(config.services || [])
    };

    return json(response);
  } catch (error) {
    console.error('FedEx API loader error:', error);
    return json({ 
      error: 'Failed to load FedEx configuration',
      config: { name: "FedEx Express", description: "FedEx Express international shipping" },
      services: [],
      zoneSets: {},
      rates: []
    }, { status: 500 });
  }
};

export const action = async ({ request }) => {
  try {
    const form = await request.formData();
    const rawConfig = form.get('config');
    const rawServices = form.get('services');

    if (!rawConfig) {
      return json({ success: false, error: 'Missing config payload' }, { status: 400 });
    }

    const updateData = JSON.parse(rawConfig);
    const services = rawServices ? JSON.parse(rawServices) : [];
    
    console.log('API received updateData:', updateData);
    console.log('API received services:', services);
    
    // Transform UI format back to JSON config structure
    const jsonConfig = {
      courierType: "FEDEX",
      version: "2.0",
      basicInfo: {
        name: updateData.name?.trim() || "FedEx Express",
        description: updateData.description?.trim() || "FedEx Express international shipping",
        isActive: true,
        supportedRegions: ["EU", "WORLDWIDE"]
      },
      shippingConfig: {
        dryIce: {
          costPerKg: parseFloat(updateData.dryIceCostPerKg) || 0,
          volumePerKg: parseFloat(updateData.dryIceVolumePerKg) || 0
        },
        ice: {
          freshPerDay: parseFloat(updateData.freshIcePerDay) || 0,
          frozenPerDay: parseFloat(updateData.frozenIcePerDay) || 0
        },
        surcharges: {
          wine: parseFloat(updateData.wineSurcharge) || 0,
          fuel: {
            percentage: parseFloat(updateData.fuelSurchargePct) || 0
          }
        },
        calculations: {
          volumetricDivisor: parseInt(updateData.volumetricDivisor) || 5000,
          vatPercentage: parseFloat(updateData.vatPct) || 22
        },
        transitDays: parseInt(updateData.transitDays) || 3
      },
      services: services.length > 0 ? services : getDefaultFedexConfig().services,
      zoneSets: updateData.zoneSets || getDefaultFedexConfig().zoneSets,
      features: getDefaultFedexConfig().features,
      apiConfig: getDefaultFedexConfig().apiConfig,
      ui: getDefaultFedexConfig().ui,
      businessRules: getDefaultFedexConfig().businessRules
    };

    // Upsert courier with JSON config
    const courier = await prisma.courier.upsert({
      where: { name: 'FEDEX' },
      create: {
        name: 'FEDEX',
        config: jsonConfig,
        isActive: true
      },
      update: {
        config: jsonConfig,
        updatedAt: new Date()
      }
    });

    return json({ success: true, courierId: courier.id });
  } catch (error) {
    console.error('FedEx API action error:', error);
    return json({ success: false, error: 'Failed to save FedEx configuration' }, { status: 500 });
  }
};

// Helper functions
function flattenShippingConfig(shippingConfig) {
  return {
    dryIceCostPerKg: shippingConfig?.dryIce?.costPerKg || 0,
    dryIceVolumePerKg: shippingConfig?.dryIce?.volumePerKg || 0,
    freshIcePerDay: shippingConfig?.ice?.freshPerDay || 0,
    frozenIcePerDay: shippingConfig?.ice?.frozenPerDay || 0,
    wineSurcharge: shippingConfig?.surcharges?.wine || 0,
    volumetricDivisor: shippingConfig?.calculations?.volumetricDivisor || 5000,
    fuelSurchargePct: shippingConfig?.surcharges?.fuel?.percentage || 0,
    vatPct: shippingConfig?.calculations?.vatPercentage || 22,
    transitDays: shippingConfig?.transitDays || 3
  };
}

// Convert new services structure to legacy rates format for backward compatibility
function formatServicesForLegacyUI(services) {
  const rates = [];
  
  services.forEach(service => {
    if (service.pricingStructure?.brackets) {
      service.pricingStructure.brackets.forEach(bracket => {
        const weight = bracket.minWeight === bracket.maxWeight 
          ? String(bracket.minWeight)
          : `${bracket.minWeight}-${bracket.maxWeight}`;
        
        const row = { 
          weight,
          service: service.code,
          serviceName: service.name
        };
        
        // Add zone rates
        if (bracket.zoneRates) {
          Object.entries(bracket.zoneRates).forEach(([zoneCode, rate]) => {
            row[zoneCode] = String(rate);
          });
        }
        
        rates.push(row);
      });
    }
  });
  
  return rates;
}

// Calculate shipping rate for given weight and destination
export function calculateFedexRate(config, weight, countryCode, serviceCode = null) {
  try {
    if (!config.services || !config.zoneSets) {
      throw new Error('Invalid FedEx configuration');
    }

    // Find the appropriate zone for the destination country
    let targetZone = null;
    let targetZoneSet = null;

    for (const [zoneSetName, zoneSet] of Object.entries(config.zoneSets)) {
      for (const zone of zoneSet.zones) {
        if (zone.countries.includes(countryCode)) {
          targetZone = zone.code;
          targetZoneSet = zoneSetName;
          break;
        }
      }
      if (targetZone) break;
    }

    if (!targetZone) {
      throw new Error(`No zone found for country: ${countryCode}`);
    }

    // Filter services by zone set and service code (if specified)
    const availableServices = config.services.filter(service => {
      if (!service.isActive) return false;
      if (service.zoneSet !== targetZoneSet) return false;
      if (serviceCode && service.code !== serviceCode) return false;
      return true;
    });

    if (availableServices.length === 0) {
      throw new Error(`No available services for zone set: ${targetZoneSet}`);
    }

    const quotes = [];

    for (const service of availableServices) {
      const rate = calculateServiceRate(service, weight, targetZone);
      if (rate > 0) {
        quotes.push({
          code: service.code,
          name: service.name,
          description: service.description,
          total: rate,
          currency: 'EUR',
          transitDays: service.transitDays
        });
      }
    }

    return quotes;
  } catch (error) {
    console.error('FedEx rate calculation error:', error);
    return [];
  }
}

function calculateServiceRate(service, weight, targetZone) {
  const { pricingStructure } = service;
  
  if (!pricingStructure) return 0;

  // Check regular brackets first
  if (pricingStructure.brackets) {
    // Sort brackets by weight for better matching
    const sortedBrackets = [...pricingStructure.brackets].sort((a, b) => a.minWeight - b.minWeight);
    
    for (const bracket of sortedBrackets) {
      // Handle floating point precision issues by using small tolerance
      const tolerance = 0.001;
      if (weight >= (bracket.minWeight - tolerance) && weight <= (bracket.maxWeight + tolerance)) {
        return bracket.zoneRates[targetZone] || 0;
      }
    }
    
    // If no exact match found, find the closest bracket
    const exactWeight = Math.round(weight * 10) / 10; // Round to 1 decimal place
    for (const bracket of sortedBrackets) {
      if (Math.abs(bracket.minWeight - exactWeight) < tolerance) {
        return bracket.zoneRates[targetZone] || 0;
      }
    }
  }

  // Check weight tiers for higher weights
  if (pricingStructure.weightTiers) {
    for (const tier of pricingStructure.weightTiers) {
      const [minRange, maxRange] = tier.range.split('-').map(r => parseInt(r));
      
      if (weight >= minRange && weight <= maxRange) {
        if (tier.type === 'PER_KG') {
          return (tier.rates[targetZone] || 0) * weight;
        } else if (tier.incrementalRates) {
          // Calculate base rate up to baseWeightKg, then add incremental
          const baseRate = calculateServiceRate(service, tier.baseWeightKg, targetZone);
          const extraWeight = weight - tier.baseWeightKg;
          const incrementalRate = tier.incrementalRates[targetZone] || 0;
          return baseRate + (extraWeight * incrementalRate);
        }
      }
    }
  }

  return 0;
}
