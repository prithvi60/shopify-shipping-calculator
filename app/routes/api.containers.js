// app/routes/api.containers.js - JSON-based containers API
import { json } from '@remix-run/node';
import prisma from '../db.server';

// Real POLALI isothermal containers from legacy database
const defaultContainers = [
  {
    name: 'POLALI0059',
    volume: '0.080',
    weight: '0.54',
    intL: '600', intW: '400', intH: '335',
    extL: '660', extW: '460', extH: '395',
    costExcl: '8.00', costIncl: '9.76'
  },
  {
    name: 'POLALI0003',
    volume: '0.074',
    weight: '0.85',
    intL: '545', intW: '335', intH: '405',
    extL: '605', extW: '400', extH: '481',
    costExcl: '6.15', costIncl: '7.50'
  },
  {
    name: 'POLALI0001',
    volume: '0.052',
    weight: '1.00',
    intL: '545', intW: '335', intH: '284',
    extL: '605', extW: '400', extH: '355',
    costExcl: '5.45', costIncl: '6.65'
  },
  {
    name: 'POLALI0013',
    volume: '0.039',
    weight: '1.40',
    intL: '545', intW: '335', intH: '214',
    extL: '605', extW: '400', extH: '285',
    costExcl: '5.05', costIncl: '6.16'
  },
  {
    name: 'POLALI0011',
    volume: '0.032',
    weight: '1.51',
    intL: '545', intW: '335', intH: '174',
    extL: '605', extW: '400', extH: '245',
    costExcl: '4.80', costIncl: '5.86'
  },
  {
    name: 'POLALI0037',
    volume: '0.023',
    weight: '1.80',
    intL: '390', intW: '280', intH: '213',
    extL: '450', extW: '340', extH: '277',
    costExcl: '3.85', costIncl: '4.70'
  },
  {
    name: 'POLALI0025',
    volume: '0.014',
    weight: '2.10',
    intL: '390', intW: '280', intH: '125',
    extL: '450', extW: '340', extH: '189',
    costExcl: '3.05', costIncl: '3.72'
  },
  {
    name: 'POLALI0133',
    volume: '0.005',
    weight: '2.45',
    intL: '290', intW: '130', intH: '140',
    extL: '350', extW: '190', extH: '200',
    costExcl: '2.25', costIncl: '2.75'
  }
];

export const loader = async () => {
  try {
    // Look for an isothermal courier configuration
    const courier = await prisma.courier.findFirst({
      where: { 
        OR: [
          { name: 'ISOTHERMAL' },
          { name: 'CONTAINERS' }
        ]
      }
    });

    if (!courier) {
      // Return default containers if no configuration exists
      return json({ containers: defaultContainers });
    }

    const config = courier.config;
    
    // Extract containers from JSON config
    const containers = config.containers || config.isothermalContainers || defaultContainers;
    
    // Transform containers to UI format
    const formattedContainers = containers.map(container => ({
      name: container.name,
      volume: String(container.maxVolumeM3 || container.volume || '0'),
      weight: String(container.weightKg || container.weight || '0'),
      intL: String(container.internalLengthMm || container.intL || '0'),
      intW: String(container.internalWidthMm || container.intW || '0'),
      intH: String(container.internalHeightMm || container.intH || '0'),
      extL: String(container.externalLengthMm || container.extL || '0'),
      extW: String(container.externalWidthMm || container.extW || '0'),
      extH: String(container.externalHeightMm || container.extH || '0'),
      costExcl: String(container.costVatExcluded || container.costExcl || '0'),
      costIncl: String(container.costVatIncluded || container.costIncl || '0')
    }));

    return json({ containers: formattedContainers });
  } catch (error) {
    console.error('Containers API loader error:', error);
    return json({ error: 'Failed to load container configuration' }, { status: 500 });
  }
};

export const action = async ({ request }) => {
  try {
    const form = await request.formData();
    const raw = form.get('containers');

    if (!raw) {
      return json({ success: false, error: 'Missing containers payload' }, { status: 400 });
    }

    const containers = JSON.parse(raw);

    // Transform UI format to JSON config structure
    const jsonConfig = {
      courierType: "ISOTHERMAL",
      version: "1.0",
      basicInfo: {
        name: "POLALI Isothermal Containers",
        description: "Professional isothermal container shipping service with POLALI containers",
        isActive: true,
        supportedRegions: ["EU", "WORLDWIDE"]
      },
      containers: containers.map(c => ({
        name: c.name,
        maxVolumeM3: parseFloat(c.volume) || 0,
        weightKg: parseFloat(c.weight) || 0,
        internalLengthMm: parseInt(c.intL) || 0,
        internalWidthMm: parseInt(c.intW) || 0,
        internalHeightMm: parseInt(c.intH) || 0,
        externalLengthMm: parseInt(c.extL) || 0,
        externalWidthMm: parseInt(c.extW) || 0,
        externalHeightMm: parseInt(c.extH) || 0,
        costVatExcluded: parseFloat(c.costExcl) || 0,
        costVatIncluded: parseFloat(c.costIncl) || 0
      })),
      features: {
        supportsIsothermalShipping: true,
        temperatureControl: true,
        maxTemperatureRange: {
          min: -20,
          max: 25,
          unit: "celsius"
        },
        containerBrand: "POLALI",
        professionalGrade: true
      }
    };

    // Upsert isothermal courier with container configuration
    const courier = await prisma.courier.upsert({
      where: { name: 'ISOTHERMAL' },
      create: {
        name: 'ISOTHERMAL',
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
    console.error('Containers API action error:', error);
    return json({ success: false, error: 'Failed to save container configuration' }, { status: 500 });
  }
};
