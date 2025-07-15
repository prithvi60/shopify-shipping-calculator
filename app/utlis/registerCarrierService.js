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
  // console.log("Carrier Data",data.data.carrierServices.edges);
  const carrierId=data.data.carrierServices.edges[0].node.id;

  const alreadyRegistered = data?.data?.carrierServices?.edges[0]?.node.name === "Box Shipping Rate" && data?.data?.carrierServices?.edges[0]?.node.callbackUrl === callbackUrl

    if(alreadyRegistered){
    console.log("🚚 Carrier Service already exists. Skipping registration.");
    return;
  }

// Create Carrier Service
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
  }`

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
  }`
console.log("Inputs for Mutation",callbackUrl,carrierId);
const result = await admin.graphql(updatemutation, {
    variables: {
      input: {
        name: "Box Shipping Rate",
        id:carrierId,
        active: true,
        callbackUrl: callbackUrl,
        // supportsServiceDiscovery: true,

      },
    },
  });

  const json = await result.json();
  console.log("📦 Carrier Service Registered:", JSON.stringify(json.data, null, 2));
}
