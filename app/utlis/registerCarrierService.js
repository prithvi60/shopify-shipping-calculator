export async function registerCarrierService(admin, callbackUrl) {
  const carrierQuery = `
    query {
      carrierServices(first: 10) {
        edges {
          node {
            name
            id
            callbackUrl
          }
        }
      }
    }`;

  const response = await admin.graphql(carrierQuery);
  const data = await response.json();

  const edges = data?.data?.carrierServices?.edges || [];

  // Only proceed if there's at least one carrierService returned
  let carrierId = null;
  let alreadyRegistered = false;

  if (edges.length > 0) {
    const node = edges[0].node;

    carrierId = node.id;
    alreadyRegistered = node.name === "Box Shipping Rate" && node.callbackUrl === callbackUrl;

    if (alreadyRegistered) {
      console.log("🚚 Carrier Service already exists. Skipping registration.");
      return;
    }
  }

  // Create Carrier Service only during install
  const createmutation = ` mutation CarrierServiceCreate($input: DeliveryCarrierServiceCreateInput!) {
    carrierServiceCreate(input: $input) {
      carrierService {
        id
        name
        callbackUrl
        active
        supportsServiceDiscovery
      }
      userErrors {
        field
        message
      }
    }
  }`;

  // Update Carrier Service
  const updatemutation = ` mutation CarrierServiceUpdate($input: DeliveryCarrierServiceUpdateInput!) {
    carrierServiceUpdate(input: $input) {
      carrierService {
        id
        name
        callbackUrl
        active
      }
      userErrors {
        field
        message
      }
    }
  }`;

  console.log("Inputs for Mutation", callbackUrl, carrierId);

  const result = await admin.graphql(updatemutation, {
    variables: {
      input: {
        name: "Box Shipping Rate",
        id: carrierId, // hide during create mutation
        active: true,
        callbackUrl: callbackUrl,
        // supportsServiceDiscovery: true, // show during create mutation
      },
    },
  });

  const json = await result.json();
  console.log("📦 Carrier Service Registered:", JSON.stringify(json.data, null, 2));
}
