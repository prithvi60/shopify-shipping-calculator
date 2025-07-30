// app/routes/api.tnt.js - JSON-based TNT API
import { json } from '@remix-run/node';
import prisma from '../db.server';

// Default TNT configuration template
const defaultTntConfig = {
  courierType: "TNT",
  version: "1.0",
  basicInfo: {
    name: "TNT Express",
    description: "TNT Express courier service",
    isActive: true,
    supportedRegions: ["EU", "WORLDWIDE"]
  },
  shippingConfig: {
    dryIce: {
      costPerKg: 15.0,
      volumePerKg: 2.5
    },
    ice: {
      freshPerDay: 1.2,
      frozenPerDay: 2.5
    },
    surcharges: {
      wine: 5.0,
      fuel: {
        percentage: 12.5
      }
    },
    calculations: {
      volumetricDivisor: 5000,
      vatPercentage: 21.0
    }
  },
  transitDays: [
    {
      zoneType: "COUNTRY",
      name: "Netherlands",
      days: 24 // Store in hours (1 day = 24 hours)
    }
  ],
  pricingBrackets: [
    {
      minWeightKg: 0,
      maxWeightKg: 1,
      price: 12.50,
      currency: "EUR"
    }
  ]
};

export const loader = async () => {
  try {
    const courier = await prisma.courier.findUnique({
      where: { name: 'TNT' }
    });

    if (!courier) {
      // Return default config if courier doesn't exist
      return json({
        config: {
          name: defaultTntConfig.basicInfo.name,
          description: defaultTntConfig.basicInfo.description,
          ...flattenShippingConfig(defaultTntConfig.shippingConfig),
          transitDaysEntries: convertHoursToDays(defaultTntConfig.transitDays)
        },
        rates: formatRatesForUI(defaultTntConfig.pricingBrackets)
      });
    }

    const config = courier.config;
    
    // Transform JSON config to format expected by existing UI
    const response = {
      config: {
        name: config.basicInfo?.name || defaultTntConfig.basicInfo.name,
        description: config.basicInfo?.description || defaultTntConfig.basicInfo.description,
        ...flattenShippingConfig(config.shippingConfig || defaultTntConfig.shippingConfig),
        transitDaysEntries: convertHoursToDays(config.transitDays || [])
      },
      rates: formatRatesForUI(config.pricingBrackets || [])
    };

    return json(response);
  } catch (error) {
    console.error('TNT API loader error:', error);
    return json({ error: 'Failed to load TNT configuration' }, { status: 500 });
  }
};

export const action = async ({ request }) => {
  try {
    const form = await request.formData();
    const rawConfig = form.get('config');

    if (!rawConfig) {
      return json({ success: false, error: 'Missing config payload' }, { status: 400 });
    }

    const updateData = JSON.parse(rawConfig);
    
    // Transform UI format back to JSON config structure
    const jsonConfig = {
      courierType: "TNT",
      version: "1.0",
      basicInfo: {
        name: updateData.name?.trim() || "TNT Express",
        description: updateData.description?.trim() || "TNT Express courier service",
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
          vatPercentage: parseFloat(updateData.vatPct) || 21
        }
      },
      transitDays: convertDaysToHours(updateData.transitDaysEntries || []),
      pricingBrackets: updateData.rates ? formatRatesFromUI(updateData.rates) : []
    };

    // Upsert courier with JSON config
    const courier = await prisma.courier.upsert({
      where: { name: 'TNT' },
      create: {
        name: 'TNT',
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
    console.error('TNT API action error:', error);
    return json({ success: false, error: 'Failed to save TNT configuration' }, { status: 500 });
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
    vatPct: shippingConfig?.calculations?.vatPercentage || 21
  };
}

// Convert hours to days for UI display
function convertHoursToDays(transitDays) {
  return transitDays.map(entry => ({
    zoneType: entry.zoneType,
    name: entry.name,
    days: String(Math.round((entry.days || 0) / 24)), // Convert hours to days
  }));
}

// Convert days to hours for database storage
function convertDaysToHours(transitDaysEntries) {
  return transitDaysEntries.map(entry => {
    const days = parseInt(entry.days, 10) || 0;
    return {
      zoneType: entry.zoneType,
      name: entry.name,
      days: days * 24, // Convert days to hours
    };
  });
}

function formatRatesForUI(pricingBrackets) {
  return pricingBrackets.map(bracket => ({
    weight: bracket.minWeightKg === bracket.maxWeightKg 
      ? String(bracket.minWeightKg)
      : `${bracket.minWeightKg}-${bracket.maxWeightKg}`,
    price: String(bracket.price || 0)
  }));
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

    const price = parseFloat(String(rate.price || '0').replace(',', '.'));

    return {
      minWeightKg: isNaN(minWeightKg) ? 0 : minWeightKg,
      maxWeightKg: isNaN(maxWeightKg) ? 0 : maxWeightKg,
      price: isNaN(price) ? 0 : price,
      currency: "EUR"
    };
  });
} 