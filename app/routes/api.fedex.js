// app/routes/api.fedex.js - JSON-based FedEx API
import { json } from '@remix-run/node';
import prisma from '../db.server';

// Zone labels that match the UI expectations
const zoneLabels = [
  'ZONA A','ZONA B','ZONA C',
  'ZONA D','ZONA E','ZONA F',
  'ZONA G','ZONA H','ZONA I'
];

// Default FedEx configuration template
const defaultFedexConfig = {
  courierType: "FEDEX",
  version: "1.0",
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
  zones: zoneLabels.map((label, index) => ({
    code: label.replace(' ', '_'),
    name: label,
    type: "COUNTRY",
    transitDays: index + 1,
    description: `Zone ${label}`
  })),
  pricingBrackets: [
    {
      minWeightKg: 0,
      maxWeightKg: 1,
      zoneRates: Object.fromEntries(zoneLabels.map((label, i) => [
        label.replace(' ', '_'), 
        25.00 + (i * 5)
      ])),
      currency: "EUR"
    }
  ]
};

export const loader = async () => {
  try {
    // Find FedEx courier with JSON config
    const courier = await prisma.courier.findUnique({
      where: { name: 'FEDEX' }
    });

    if (!courier) {
      // Return default config if courier doesn't exist
      return json({
        config: {
          name: defaultFedexConfig.basicInfo.name,
          description: defaultFedexConfig.basicInfo.description,
          ...flattenShippingConfig(defaultFedexConfig.shippingConfig)
        },
        rates: formatRatesForUI(defaultFedexConfig.pricingBrackets)
      });
    }

    const config = courier.config;
    
    // Transform JSON config to format expected by existing UI
    const response = {
      config: {
        name: config.basicInfo?.name || defaultFedexConfig.basicInfo.name,
        description: config.basicInfo?.description || defaultFedexConfig.basicInfo.description,
        ...flattenShippingConfig(config.shippingConfig || defaultFedexConfig.shippingConfig)
      },
      rates: formatRatesForUI(config.pricingBrackets || [])
    };

    return json(response);
  } catch (error) {
    console.error('FedEx API loader error:', error);
    return json({ error: 'Failed to load FedEx configuration' }, { status: 500 });
  }
};

export const action = async ({ request }) => {
  try {
    const form = await request.formData();
    const rawConfig = form.get('config');
    const rawRates = form.get('rates');

    if (!rawConfig || !rawRates) {
      return json({ success: false, error: 'Missing config or rates payload' }, { status: 400 });
    }

    const updateData = JSON.parse(rawConfig);
    const rates = JSON.parse(rawRates);
    
    // Transform UI format back to JSON config structure
    const jsonConfig = {
      courierType: "FEDEX",
      version: "1.0",
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
      zones: zoneLabels.map((label, index) => ({
        code: label.replace(' ', '_'),
        name: label,
        type: "COUNTRY",
        transitDays: index + 1,
        description: `Zone ${label}`
      })),
      pricingBrackets: formatRatesFromUI(rates),
      services: [
        {
          code: "FEDEX_STANDARD",
          name: "FedEx Standard",
          description: "Standard delivery service",
          additionalCost: 0,
          isDefault: true
        },
        {
          code: "FEDEX_BEFORE_10",
          name: "FedEx Before 10:00",
          description: "Delivery before 10:00 AM",
          additionalCost: 5.00,
          isDefault: false
        }
      ]
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

// Helper functions to transform data between JSON config and UI format
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

function formatRatesForUI(pricingBrackets) {
  return pricingBrackets.map(bracket => {
    const weight = bracket.minWeightKg === bracket.maxWeightKg 
      ? String(bracket.minWeightKg)
      : `${bracket.minWeightKg}-${bracket.maxWeightKg}`;
    
    const row = { weight };
    
    // Initialize blanks for all zones
    zoneLabels.forEach(label => {
      const key = label.replace(/\s+/g, '_');
      row[key] = '';
    });
    
    // Fill in actual zone rates
    if (bracket.zoneRates) {
      Object.entries(bracket.zoneRates).forEach(([zoneCode, rate]) => {
        if (row.hasOwnProperty(zoneCode)) {
          row[zoneCode] = String(rate);
        }
      });
    }
    
    return row;
  });
}

function formatRatesFromUI(rates) {
  return rates.map(rate => {
    const weightStr = String(rate.weight).trim();
    let minWeightKg, maxWeightKg;

    if (weightStr.includes('-')) {
      const parts = weightStr.split('-').map(s => parseFloat(s.replace(',', '.')));
      minWeightKg = parts[0];
      maxWeightKg = !isNaN(parts[1]) ? parts[1] : parts[0];
    } else {
      const weight = parseFloat(weightStr.replace(',', '.'));
      minWeightKg = weight;
      maxWeightKg = weight;
    }

    // Build zone rates object
    const zoneRates = {};
    zoneLabels.forEach(label => {
      const key = label.replace(/\s+/g, '_');
      const rawVal = (rate[key] ?? '').toString().replace(',', '.');
      const rateValue = parseFloat(rawVal);
      if (!isNaN(rateValue)) {
        zoneRates[key] = rateValue;
      }
    });

    return {
      minWeightKg: isNaN(minWeightKg) ? 0 : minWeightKg,
      maxWeightKg: isNaN(maxWeightKg) ? 0 : maxWeightKg,
      zoneRates,
      currency: "EUR"
    };
  });
}
