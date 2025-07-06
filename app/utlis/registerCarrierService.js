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

  const alreadyRegistered = data?.data?.carrierServices?.edges?.some(edge =>
    edge.node.name === "Box Shipping Rate"
  );

  if (alreadyRegistered) {
    console.log("🚚 Carrier Service already exists. Skipping registration.");
    return;
  }

  const mutation = `
    mutation carrierServiceCreate($input: CarrierServiceInput!) {
      carrierServiceCreate(input: $input) {
        carrierService {
          id
          name
          callbackUrl
        }
        userErrors {
          field
          message
        }
      }
    }`;

  const result = await admin.graphql(mutation, {
    variables: {
      input: {
        name: "Box Shipping Rate",
        callbackUrl: callbackUrl,
        serviceDiscovery: true,
        format: "JSON",
      },
    },
  });

  const json = await result.json();
  console.log("📦 Carrier Service Registration Result:", JSON.stringify(json, null, 2));
}
