// app/routes/api.fedex.js - Enhanced JSON-based FedEx API with multiple services
import { json } from '@remix-run/node';
import prisma from '../db.server';

export const loader = async () => {
  try {
    // Find FedEx courier with JSON config
    const courier = await prisma.courier.findUnique({
      where: { name: 'FEDEX' }
    });

    if (!courier || !courier.config) {
      // Return empty configuration if no courier exists
      return json({
        config: {
          name: "FedEx Express",
          description: "FedEx Express international shipping"
        },
        services: [],
        zoneSets: {}
      });
    }

    const config = courier.config;
    
    // Transform JSON config to format expected by UI
    const response = {
      config: {
        name: config.basicInfo?.name || "FedEx Express",
        description: config.basicInfo?.description || "FedEx Express international shipping",
        ...flattenShippingConfig(config.shippingConfig || {})
      },
      services: config.services || [],
      zoneSets: config.zoneSets || {}
    };

    return json(response);
  } catch (error) {
    console.error('FedEx API loader error:', error);
    return json({ 
      error: 'Failed to load FedEx configuration',
      config: { name: "FedEx Express", description: "FedEx Express international shipping" },
      services: [],
      zoneSets: {}
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
      services: services.length > 0 ? services : [],
      zoneSets: updateData.zoneSets || {}
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

function calculateServiceRate(service, weight, targetZone) {
  const { pricingStructure } = service;
  if (!pricingStructure) return 0;

  console.log(`   📦 Calculating rate for ${service.name} (Zone ${targetZone}):`);

  // 1. Check for fixed rates - find the rate where minWeight <= weight <= maxWeight
  if (pricingStructure.fixedRates) {
    for (const rate of pricingStructure.fixedRates) {
      // Check if weight falls within the range
      if (weight >= rate.minWeight && weight <= rate.maxWeight) {
        const finalRate = rate.zoneRates[targetZone] || 0;
        console.log(`   ✅ Fixed rate: ${rate.minWeight}-${rate.maxWeight}kg → €${finalRate}`);
        return finalRate;
      }
    }
  }

  // 2. Check for progressive rates - find the rate where minWeight < weight <= maxWeight
  if (pricingStructure.progressiveRates) {
    for (const rate of pricingStructure.progressiveRates) {
      if (weight > rate.minWeight && weight <= rate.maxWeight) {
        const baseRate = rate.baseRates[targetZone] || 0;
        if (baseRate === 0) continue; // Cannot calculate without a base rate

        const additionalWeight = weight - rate.baseWeight;
        const additionalUnits = Math.ceil(additionalWeight / rate.unit);
        const additionalCost = additionalUnits * (rate.additionalRates[targetZone] || 0);
        const finalRate = baseRate + additionalCost;
        
        console.log(`   ✅ Progressive rate: Base €${baseRate} + ${additionalUnits} units × €${rate.additionalRates[targetZone]} = €${finalRate}`);
        console.log(`      (Additional weight: ${additionalWeight}kg, Unit: ${rate.unit}kg)`);
        return finalRate;
      }
    }
  }
  
  // 3. Check for bulk rates (per kg multiplied) - find the rate where minWeight <= weight <= maxWeight
  if (pricingStructure.bulkRates) {
    for (const rate of pricingStructure.bulkRates) {
      if (weight >= rate.minWeight && weight <= rate.maxWeight) {
        const perKgRate = rate.perKgRates[targetZone] || 0;
        const finalRate = weight * perKgRate;
        console.log(`   ✅ Bulk rate: ${weight}kg × €${perKgRate}/kg = €${finalRate}`);
        return finalRate;
      }
    }
  }

  console.log(`   ❌ No matching rate found for ${weight}kg`);
  return 0; // Return 0 if no matching rate is found
}

// Calculate shipping rate for given weight and destination
export function calculateFedexRate(config, weight, countryCode, serviceCode = null) {
  try {
    console.log(`💰 FedEx Price Calculation for ${weight}kg to ${countryCode}:`);
    
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
          console.log(`🌍 Zone mapping: ${countryCode} → Zone ${targetZone} (${zoneSetName})`);
          break;
        }
      }
      if (targetZone) break;
    }

    if (!targetZone) {
      throw new Error(`No zone found for country: ${countryCode}`);
    }

    // Zone set mapping to handle zone set names
    const zoneSetMapping = {
      'INT': 'INTERNATIONAL',  // For INT PRIORITY EXPRESS
      'EU': 'EU',             // For EU PRIORITY EXPRESS, EU INTERNATIONAL PRIORITY, REGIONAL ECONOMY
      'IP': 'EU',             // Legacy mapping for backward compatibility
      'IE': 'INTERNATIONAL',  // Legacy mapping for backward compatibility
      'RE': 'EU'              // Legacy mapping for backward compatibility
    };

    // Filter services by zone set and service code (if specified)
    const availableServices = config.services.filter(service => {
      if (!service.isActive) return false;
      
      // Map legacy zone set names to actual zone sets
      const mappedZoneSet = zoneSetMapping[service.zoneSet] || service.zoneSet;
      if (mappedZoneSet !== targetZoneSet) return false;
      
      if (serviceCode && service.code !== serviceCode) return false;
      return true;
    });

    if (availableServices.length === 0) {
      throw new Error(`No available services for zone set: ${targetZoneSet}`);
    }

    const quotes = [];

    console.log(`\n🚚 FEDEX SERVICE CALCULATIONS:`);
    
    for (const service of availableServices) {
      const rate = calculateServiceRate(service, weight, targetZone);
      if (rate > 0) {
        const transitDays = service.transitDays || 3; // Default to 3 days if not specified
        console.log(`🚚 ${service.name}: Base rate €${rate.toFixed(2)} (${transitDays} days)`);
        console.log(`   ⚠️  Note: Surcharges (fuel, wine, dry ice) and VAT applied separately`);
        
        quotes.push({
          code: service.code,
          name: `FedEx ${service.name} (${transitDays} days)`,
          description: service.description,
          total: rate,
          currency: 'EUR',
          transitDays: transitDays
        });
      }
    }

    console.log(`📊 Total FedEx services found: ${quotes.length}`);
    return quotes;
  } catch (error) {
    console.error('FedEx rate calculation error:', error);
    return [];
  }
}