// app/shipping/couriers/index.js - JSON-based courier system
import prisma from '../../db.server.js';

// Unified JSON-based courier calculation
export function getCourierModule(name) {
  // Return a standardized module for all JSON-based couriers
  return {
    loadConfigAndRates: async () => loadJSONConfigAndRates(name),
    calculate: (params) => calculateFromJSON(params)
  };
}

// Load courier configuration from JSON
async function loadJSONConfigAndRates(courierName) {
  try {
    const courier = await prisma.courier.findUnique({
      where: { name: courierName.toUpperCase() }
    });

    if (!courier) {
      throw new Error(`Courier ${courierName} not found`);
    }

    const config = courier.config;
    
    return {
      config: {
        courierType: config.courierType,
        name: config.basicInfo?.name || courierName,
        description: config.basicInfo?.description || '',
        ...config.shippingConfig?.calculations,
        ...config.shippingConfig?.surcharges,
        dryIce: config.shippingConfig?.dryIce,
        ice: config.shippingConfig?.ice,
        zones: config.zones || [],
        pricingBrackets: config.pricingBrackets || [],
        transitDays: config.transitDays || [],
        services: config.services || []
      },
      brackets: config.pricingBrackets || [],
      zones: config.zones || [],
      containers: [], // Not used in JSON system
      timeSlotFees: config.services || []
    };
  } catch (error) {
    console.error(`Error loading config for ${courierName}:`, error);
    throw error;
  }
}

// Calculate shipping rates from JSON configuration
function calculateFromJSON({ cartItems, config }) {
  const courierType = config.courierType;
  
  if (courierType === 'TNT') {
    return calculateTNTFromJSON({ cartItems, config });
  } else if (courierType === 'FEDEX') {
    return calculateFedExFromJSON({ cartItems, config });
  } else {
    throw new Error(`Unknown courier type: ${courierType}`);
  }
}

// TNT calculation from JSON config
function calculateTNTFromJSON({ cartItems, config }) {
  try {
    // Get destination info from first cart item
    const firstItem = cartItems[0];
    if (!firstItem) {
      throw new Error('No cart items provided');
    }

    const { countryCode, city, province, postalCode } = firstItem;
    
    // Create destination zone object
    const destinationZone = {
      countryCode,
      city,
      province,
      postalCode
    };

    // Find best transit match
    const transitEntry = findBestTransitMatch(destinationZone, config.transitDays || []);
    const transitDays = transitEntry?.days || 3;

    // Calculate total weight
    const totalWeight = cartItems.reduce((sum, item) => sum + item.weight, 0);

    // Find pricing bracket
    const bracket = config.pricingBrackets?.find(b =>
      totalWeight >= b.minWeightKg && totalWeight <= b.maxWeightKg
    );

    if (!bracket) {
      throw new Error(`No pricing bracket found for weight ${totalWeight}kg`);
    }

    let subtotal = bracket.price || 0;

    // Apply fuel surcharge
    if (config.fuel?.percentage > 0) {
      subtotal += subtotal * (config.fuel.percentage / 100);
    }

    // Apply VAT
    const vatRate = config.vatPercentage || 21;
    const total = subtotal * (1 + vatRate / 100);

    return {
      name: `${config.name} (${transitDays} days)`,
      code: 'TNT_STANDARD',
      total,
      currency: 'EUR',
      description: `Delivery in ${transitDays} business days`,
      transitDays
    };
  } catch (error) {
    console.error('TNT calculation error:', error);
    throw error;
  }
}

// FedEx calculation from JSON config
function calculateFedExFromJSON({ cartItems, config }) {
  try {
    // Get destination info from first cart item
    const firstItem = cartItems[0];
    if (!firstItem) {
      throw new Error('No cart items provided');
    }

    const { countryCode, city, province, postalCode } = firstItem;
    
    // Find matching zone
    const zone = config.zones?.find(z =>
      z.type === 'COUNTRY' && 
      (z.name.includes(countryCode) || z.code.includes(countryCode))
    );

    if (!zone) {
      throw new Error(`No zone found for country ${countryCode}`);
    }

    // Calculate total weight
    const totalWeight = cartItems.reduce((sum, item) => sum + item.weight, 0);

    // Find pricing bracket
    const bracket = config.pricingBrackets?.find(b =>
      totalWeight >= b.minWeightKg && totalWeight <= b.maxWeightKg
    );

    if (!bracket) {
      throw new Error(`No pricing bracket found for weight ${totalWeight}kg`);
    }

    // Get zone rate
    const zoneCode = zone.code || zone.name.replace(' ', '_');
    const baseRate = bracket.zoneRates?.[zoneCode];

    if (!baseRate) {
      throw new Error(`No rate found for zone ${zoneCode}`);
    }

    let subtotal = baseRate;
    const transitDays = config.transitDays || zone.transitDays || 3;

    // Apply fuel surcharge
    if (config.fuel?.percentage > 0) {
      subtotal += subtotal * (config.fuel.percentage / 100);
    }

    // Apply VAT
    const vatRate = config.vatPercentage || 22;
    const total = subtotal * (1 + vatRate / 100);

    // Return multiple service options if available
    const services = config.services || [{
      code: "FEDEX_STANDARD",
      name: "FedEx Standard",
      description: "Standard delivery service",
      additionalCost: 0,
      isDefault: true
    }];

    return services.map(service => ({
      name: `${service.name} (${transitDays} days)`,
      code: service.code,
      total: total + (service.additionalCost || 0),
      currency: 'EUR',
      description: `${service.description} - Delivery in ${transitDays} business days`,
      transitDays
    }));
  } catch (error) {
    console.error('FedEx calculation error:', error);
    throw error;
  }
}

// Helper function to find best transit match
function findBestTransitMatch(destinationZone, transitDays) {
  if (!transitDays || transitDays.length === 0) {
    return { days: 3 }; // Default
  }

  // Try to match in order of specificity: ZIP > CITY > PROVINCE > REGION > COUNTRY
  const priorities = ['ZIP', 'CITY', 'PROVINCE', 'REGION', 'COUNTRY'];
  
  for (const priority of priorities) {
    const match = transitDays.find(td => {
      if (td.zoneType !== priority) return false;
      
      switch (priority) {
        case 'ZIP':
          return td.name === destinationZone.postalCode;
        case 'CITY':
          return td.name.toLowerCase() === destinationZone.city?.toLowerCase();
        case 'PROVINCE':
          return td.name.toLowerCase() === destinationZone.province?.toLowerCase();
        case 'COUNTRY':
          return td.name.toLowerCase() === destinationZone.countryCode?.toLowerCase();
        default:
          return false;
      }
    });
    
    if (match) return match;
  }
  
  // Return first available or default
  return transitDays[0] || { days: 3 };
}
