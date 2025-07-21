import { json } from '@remix-run/node';
import prisma from '../db.server';

const defaultContainers = [
  {
    name: 'POLALI0059',
    maxVolumeM3: 0.080,
    weightKg: 0.54,
    internalLengthMm: 600,
    internalWidthMm: 400,
    internalHeightMm: 335,
    externalLengthMm: 660,
    externalWidthMm: 460,
    externalHeightMm: 395,
    costVatExcluded: 8.00,
    costVatIncluded: 9.76
  },
  {
    name: 'POLALI0003',
    maxVolumeM3: 0.074,
    weightKg: 0.85,
    internalLengthMm: 545,
    internalWidthMm: 335,
    internalHeightMm: 405,
    externalLengthMm: 605,
    externalWidthMm: 400,
    externalHeightMm: 481,
    costVatExcluded: 6.15,
    costVatIncluded: 7.50
  },
  {
    name: 'POLALI0001',
    maxVolumeM3: 0.052,
    weightKg: 1.00,
    internalLengthMm: 545,
    internalWidthMm: 335,
    internalHeightMm: 284,
    externalLengthMm: 605,
    externalWidthMm: 400,
    externalHeightMm: 355,
    costVatExcluded: 5.45,
    costVatIncluded: 6.65
  },
  {
    name: 'POLALI0013',
    maxVolumeM3: 0.039,
    weightKg: 1.40,
    internalLengthMm: 545,
    internalWidthMm: 335,
    internalHeightMm: 214,
    externalLengthMm: 605,
    externalWidthMm: 400,
    externalHeightMm: 285,
    costVatExcluded: 5.05,
    costVatIncluded: 6.16
  },
  {
    name: 'POLALI0011',
    maxVolumeM3: 0.032,
    weightKg: 1.51,
    internalLengthMm: 545,
    internalWidthMm: 335,
    internalHeightMm: 174,
    externalLengthMm: 605,
    externalWidthMm: 400,
    externalHeightMm: 245,
    costVatExcluded: 4.80,
    costVatIncluded: 5.86
  },
  {
    name: 'POLALI0037',
    maxVolumeM3: 0.023,
    weightKg: 1.80,
    internalLengthMm: 390,
    internalWidthMm: 280,
    internalHeightMm: 213,
    externalLengthMm: 450,
    externalWidthMm: 340,
    externalHeightMm: 277,
    costVatExcluded: 3.85,
    costVatIncluded: 4.70
  },
  {
    name: 'POLALI0025',
    maxVolumeM3: 0.014,
    weightKg: 2.10,
    internalLengthMm: 390,
    internalWidthMm: 280,
    internalHeightMm: 125,
    externalLengthMm: 450,
    externalWidthMm: 340,
    externalHeightMm: 189,
    costVatExcluded: 3.05,
    costVatIncluded: 3.72
  },
  {
    name: 'POLALI0133',
    maxVolumeM3: 0.005,
    weightKg: 2.45,
    internalLengthMm: 290,
    internalWidthMm: 130,
    internalHeightMm: 140,
    externalLengthMm: 350,
    externalWidthMm: 190,
    externalHeightMm: 200,
    costVatExcluded: 2.25,
    costVatIncluded: 2.75
  }
];

export const loader = async () => {
  let courier = await prisma.courier.findFirst({
    where: { name: 'Isothermal' }
  });

  if (!courier) {
    courier = await prisma.courier.create({
      data: {
        name: 'Isothermal',
        description: 'Default courier for isothermal containers'
      }
    });
  }

  let containers = await prisma.container.findMany({
    where: { courierId: courier.id },
    orderBy: { maxVolumeM3: 'desc' }
  });

  if (containers.length === 0) {
    await Promise.all(defaultContainers.map(c =>
      prisma.container.create({
        data: {
          courierId: courier.id,
          name: c.name,
          maxVolumeM3: c.maxVolumeM3,
          weightKg: c.weightKg,
          internalLengthMm: c.internalLengthMm,
          internalWidthMm:  c.internalWidthMm,
          internalHeightMm: c.internalHeightMm,
          externalLengthMm: c.externalLengthMm,
          externalWidthMm:  c.externalWidthMm,
          externalHeightMm: c.externalHeightMm,
          costVatExcluded:  c.costVatExcluded,
          costVatIncluded:  c.costVatIncluded
        }
      })
    ));
    containers = await prisma.container.findMany({
      where: { courierId: courier.id },
      orderBy: { maxVolumeM3: 'desc' }
    });
  }

  return json({ containers });
};

export const action = async ({ request }) => {
  const form = await request.formData();
  const raw = form.get('containers');

  if (!raw) {
    return json({ success: false, error: 'Missing containers payload' }, { status: 400 });
  }

  let rows;
  try {
    rows = JSON.parse(raw);
  } catch {
    return json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  let courier = await prisma.courier.findFirst({
    where: { name: 'Isothermal' }
  });

  if (!courier) {
    courier = await prisma.courier.create({
      data: {
        name: 'Isothermal',
        description: 'Default courier for isothermal containers'
      }
    });
  }

  await prisma.container.deleteMany({
    where: { courierId: courier.id }
  });

  await Promise.all(rows.map(c =>
    prisma.container.create({
      data: {
        courierId: courier.id,
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
      }
    })
  ));

  return json({ success: true });
};
