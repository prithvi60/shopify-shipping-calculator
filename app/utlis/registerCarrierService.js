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

  console.log("Carrier Services", edges);

  // Check if there's already a carrier service with our exact name and callback URL
  let existingCarrierService = null;
  let alreadyRegistered = false;

  if (edges.length > 0) {
    // Look for a carrier service that exactly matches our name and callback URL
    existingCarrierService = edges.find(edge => 
      edge.node.name === "Box Shipping Rate" && 
      edge.node.callbackUrl === callbackUrl
    );

    if (existingCarrierService) {
      alreadyRegistered = true;
      console.log("🚚 Carrier Service already exists with matching name and callback URL. Skipping registration.");
      return;
    }
  }

  // Since we can only update carrier services we created, and we don't have a way to check ownership,
  // we'll always create a new carrier service instead of trying to update existing ones
  console.log("Creating new carrier service...");

  // Delete all existing carrier services before creating a new one
  console.log("🧹 Cleaning up: Deleting all existing carrier services first...");
  await deleteAllCarrierServices(admin);

  // Create Carrier Service
  const createmutation = `mutation CarrierServiceCreate($input: DeliveryCarrierServiceCreateInput!) {
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

  console.log("Inputs for Mutation", callbackUrl);

  const result = await admin.graphql(createmutation, {
    variables: {
      input: {
        name: "Box Shipping Rate",
        active: true,
        callbackUrl: callbackUrl,
        supportsServiceDiscovery: true,
      },
    },
  });

  const json = await result.json();
  
  // Check for errors
  if (json.data?.carrierServiceCreate?.userErrors?.length > 0) {
    console.error("❌ Error creating carrier service:", json.data.carrierServiceCreate.userErrors);
    return;
  }

  console.log("📦 Carrier Service Created:", JSON.stringify(json.data?.carrierServiceCreate?.carrierService, null, 2));
}

export async function deleteAllCarrierServices(admin) {
  console.log("🗑️ Starting deletion of all carrier services...");
  
  // First, query all existing carrier services
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
  
  if (edges.length === 0) {
    console.log("✅ No carrier services found to delete.");
    return;
  }

  console.log(`Found ${edges.length} carrier service(s) to delete:`, edges.map(edge => ({ name: edge.node.name, id: edge.node.id })));

  // Delete each carrier service
  const deleteMutation = `mutation CarrierServiceDelete($id: ID!) {
    carrierServiceDelete(id: $id) {
      deletedId
      userErrors {
        field
        message
      }
    }
  }`;

  const deleteResults = [];
  
  for (const edge of edges) {
    const carrierId = edge.node.id;
    const carrierName = edge.node.name;
    
    try {
      console.log(`🗑️ Deleting carrier service: ${carrierName} (ID: ${carrierId})`);
      
      const deleteResult = await admin.graphql(deleteMutation, {
        variables: {
          id: carrierId,
        },
      });

      const deleteJson = await deleteResult.json();
      
      if (deleteJson.data?.carrierServiceDelete?.userErrors?.length > 0) {
        console.error(`❌ Error deleting carrier service ${carrierName}:`, JSON.stringify(deleteJson.data.carrierServiceDelete.userErrors, null, 2));
        deleteResults.push({ id: carrierId, name: carrierName, success: false, errors: deleteJson.data.carrierServiceDelete.userErrors });
      } else {
        console.log(`✅ Successfully deleted carrier service: ${carrierName}`);
        deleteResults.push({ id: carrierId, name: carrierName, success: true, deletedId: deleteJson.data?.carrierServiceDelete?.deletedId });
      }
    } catch (error) {
      console.error(`❌ Exception while deleting carrier service ${carrierName}:`, error);
      deleteResults.push({ id: carrierId, name: carrierName, success: false, error: error.message });
    }
  }

  console.log("🏁 Deletion process completed. Results:", JSON.stringify(deleteResults, null, 2));
  return deleteResults;
}
