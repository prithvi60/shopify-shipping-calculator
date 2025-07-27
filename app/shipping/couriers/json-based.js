// app/shipping/couriers/json-based.js - JSON-based courier shipping calculations
import prisma from '../../db.server.js';

/**
 * Load courier configuration by code
 */
export async function loadCourierConfig(code) {
  const courier = await prisma.courier.findUnique({
    where: { code: code.toUpperCase() }
  });
  
  if (!courier || !courier.isActive) {
    return null;
  }
  
  return courier.config;
}

/**
 * Calculate shipping rates for TNT using JSON configuration
 */
export async function calculateTntRates({ cartItems, destinationZone }) {
  const config = await loadCourierConfig('TNT');
  if (!config) {
    throw new Error('TNT configuration not found');
  }

  // Get basic calculations
  const { totalWeight, totalVolume, volumetricWeight, shippingWeight } = calculateBasics(cartItems, config);
  
  // Find matching transit days entry
  const transitEntry = findBestTransitMatch(destinationZone, config.transitDays);
  const transitDays = transitEntry?.days || 3;

  // Find price bracket
  const bracket = config.pricingBrackets?.find(b => 
    shippingWeight >= b.minWeightKg && shippingWeight <= b.maxWeightKg
  );
  
  if (!bracket) {
    throw new Error('No pricing bracket found for weight: ' + shippingWeight);
  }

  // Calculate additional costs
  const { iceCost, wineCost } = calculateAdditionalCosts(cartItems, config, transitDays);
  
  // Build base cost
  let subtotal = bracket.price + iceCost + wineCost;
  
  // Apply fuel surcharge
  if (config.shippingConfig?.surcharges?.fuel?.percentage > 0) {
    subtotal += subtotal * (config.shippingConfig.surcharges.fuel.percentage / 100);
  }
  
  // Apply VAT
  const vatRate = config.shippingConfig?.calculations?.vatPercentage || 21;
  const total = subtotal * (1 + vatRate / 100);

  return [{
    name: config.basicInfo?.name || 'TNT Express',
    code: 'TNT_STANDARD',
    total: Math.round(total * 100) / 100,
    currency: bracket.currency || 'EUR',
    transitDays,
    description: `Base €${bracket.price.toFixed(2)}, Ice €${iceCost.toFixed(2)}, Wine €${wineCost.toFixed(2)}, Fuel & VAT included`
  }];
}

/**
 * Calculate shipping rates for FedEx using JSON configuration
 */
export async function calculateFedexRates({ cartItems, destinationZone }) {
  const config = await loadCourierConfig('FEDEX');
  if (!config) {
    throw new Error('FedEx configuration not found');
  }

  // Get basic calculations
  const { totalWeight, totalVolume, volumetricWeight, shippingWeight } = calculateBasics(cartItems, config);
  
  // Find matching zone
  const zone = config.zones?.find(z => 
    z.name === destinationZone || z.code === destinationZone
  );
  
  if (!zone) {
    throw new Error('Destination zone not supported: ' + destinationZone);
  }

  // Find price bracket
  const bracket = config.pricingBrackets?.find(b => 
    shippingWeight >= b.minWeightKg && shippingWeight <= b.maxWeightKg
  );
  
  if (!bracket) {
    throw new Error('No pricing bracket found for weight: ' + shippingWeight);
  }

  // Get zone-specific rate
  const zoneRate = bracket.zoneRates?.[zone.code] || bracket.zoneRates?.[zone.name.replace(' ', '_')];
  if (!zoneRate) {
    throw new Error('No rate found for zone: ' + zone.name);
  }

  // Calculate additional costs
  const transitDays = config.shippingConfig?.transitDays || zone.transitDays || 3;
  const { iceCost, wineCost } = calculateAdditionalCosts(cartItems, config, transitDays);
  
  // Build base cost
  let subtotal = zoneRate + iceCost + wineCost;
  
  // Apply fuel surcharge
  if (config.shippingConfig?.surcharges?.fuel?.percentage > 0) {
    subtotal += subtotal * (config.shippingConfig.surcharges.fuel.percentage / 100);
  }
  
  // Apply VAT
  const vatRate = config.shippingConfig?.calculations?.vatPercentage || 22;
  const baseTotal = subtotal * (1 + vatRate / 100);

  // Generate service options
  const quotes = [];
  
  // Standard service
  quotes.push({
    name: `${config.basicInfo?.name || 'FedEx'} Standard`,
    code: 'FEDEX_STANDARD',
    total: Math.round(baseTotal * 100) / 100,
    currency: bracket.currency || 'EUR',
    transitDays,
    description: `Zone ${zone.name}, Base €${zoneRate.toFixed(2)}, Ice €${iceCost.toFixed(2)}, Wine €${wineCost.toFixed(2)}, Fuel & VAT included`
  });

  // Premium services
  const services = config.services || [];
  services.forEach(service => {
    if (service.code !== 'FEDEX_STANDARD' && service.additionalCost > 0) {
      quotes.push({
        name: service.name,
        code: service.code,
        total: Math.round((baseTotal + service.additionalCost) * 100) / 100,
        currency: bracket.currency || 'EUR',
        transitDays: Math.max(1, transitDays - 1), // Premium services are usually faster
        description: `${service.description} - Additional €${service.additionalCost.toFixed(2)}`
      });
    }
  });

  return quotes;
}

/**
 * Calculate basic shipping metrics
 */
function calculateBasics(cartItems, config) {
  const totalWeight = cartItems.reduce((sum, item) => sum + (item.weight * item.quantity), 0);
  const totalVolume = cartItems.reduce((sum, item) => {
    const volume = item.dimensions?.volume || 
      (item.dimensions?.depth * item.dimensions?.width * item.dimensions?.height / 1_000_000);
    return sum + (volume * item.quantity);
  }, 0);
  
  const volumetricDivisor = config.shippingConfig?.calculations?.volumetricDivisor || 5000;
  const volumetricWeight = (totalVolume * 1_000_000) / volumetricDivisor;
  const shippingWeight = Math.max(totalWeight, volumetricWeight);
  
  return { totalWeight, totalVolume, volumetricWeight, shippingWeight };
}

/**
 * Calculate additional costs (ice, wine, etc.)
 */
function calculateAdditionalCosts(cartItems, config, transitDays) {
  const weightByCategory = cartItems.reduce((acc, item) => {
    const category = item.category || 'standard';
    acc[category] = (acc[category] || 0) + (item.weight * item.quantity);
    return acc;
  }, {});

  // Ice costs
  const freshIceKg = (weightByCategory.fresh || 0) * 
    (config.shippingConfig?.ice?.freshPerDay || 0) * transitDays;
  const frozenIceKg = (weightByCategory.frozen || 0) * 
    (config.shippingConfig?.ice?.frozenPerDay || 0) * transitDays;
  const iceCost = (freshIceKg + frozenIceKg) * 
    (config.shippingConfig?.dryIce?.costPerKg || 0);

  // Wine costs
  const wineCost = (weightByCategory.wine || 0) * 
    (config.shippingConfig?.surcharges?.wine || 0);

  return { iceCost, wineCost };
}

/**
 * Find best matching transit days entry for destination
 */
function findBestTransitMatch(destinationZone, transitDaysEntries) {
  if (!transitDaysEntries || transitDaysEntries.length === 0) {
    return null;
  }

  // Priority order: ZIP > CITY > PROVINCE > REGION > COUNTRY
  const priorityOrder = ['ZIP', 'CITY', 'PROVINCE', 'REGION', 'COUNTRY'];
  
  for (const priority of priorityOrder) {
    const match = transitDaysEntries.find(entry => 
      entry.zoneType === priority && 
      entry.name.toLowerCase().includes(destinationZone.toLowerCase())
    );
    if (match) return match;
  }
  
  // Fallback to first country-level entry
  return transitDaysEntries.find(entry => entry.zoneType === 'COUNTRY') || transitDaysEntries[0];
}

/**
 * Generic calculate function that routes to appropriate courier
 */
export async function calculateJsonBasedRates(courierCode, params) {
  switch (courierCode.toUpperCase()) {
    case 'TNT':
      return await calculateTntRates(params);
    case 'FEDEX':
      return await calculateFedexRates(params);
    default:
      throw new Error(`Courier ${courierCode} not supported`);
  }
}

/**
 * Get all active couriers with their basic info
 */
export async function getActiveCouriers() {
  const couriers = await prisma.courier.findMany({
    where: { isActive: true },
    select: {
      id: true,
      code: true,
      config: true,
      updatedAt: true
    }
  });

  return couriers.map(courier => ({
    id: courier.id,
    code: courier.code,
    name: courier.config?.basicInfo?.name || courier.code,
    description: courier.config?.basicInfo?.description || '',
    displayOrder: courier.config?.ui?.displayOrder || 999,
    color: courier.config?.ui?.color || '#666666',
    lastUpdated: courier.updatedAt
  })).sort((a, b) => a.displayOrder - b.displayOrder);
} 