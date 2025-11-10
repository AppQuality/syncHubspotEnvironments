const axios = require('axios');

const { PROD_TOKEN, STAGING_TOKEN } = require('./constants');

const OBJECTS = ['contacts', 'companies', 'deals']; // :objectType to sync
const SYNC_ENABLED = {
  propertyGroups: false,
  properties: false,
  pipelines: true,
}; // Enable/disable sync of :objectType entities

async function cloneProperties(objectType) {
  await checkTokens();

  /* --- Property Groups --- */

  // Check if sync of property groups is enabled
  if (SYNC_ENABLED.propertyGroups) {
    console.log(`Syncing property groups for ${objectType.toUpperCase()}`);

    // Fetch groups from source portal to developer portal
    const fieldPropsGroups = await getGroupsPROD(objectType);
    const stagingGroupsNames = await getGroupsNamesSTAGING(objectType);

    for (const group of fieldPropsGroups.results) {
      // Skip default groups
      if (group.default) continue;

      if (stagingGroupsNames.includes(group.name)) {
        await updatePropertyGroupSTAGING(group, objectType);
      } else {
        await addPropertyGroupSTAGING(objectType, group);
      }
    }
  } else {
    console.log(`Skipping property groups sync for ${objectType.toUpperCase()}`);
  }

  /* --- Properties --- */

  // Check if sync of properties is enabled
  if (SYNC_ENABLED.properties) {
    console.log(`Syncing properties for ${objectType.toUpperCase()}`);

    // Fetch properties from source portal to developer portal
    const fieldProps = await getProperties(objectType);
    const stagingPropertiesNames = await getPropertiesNamesSTAGING(objectType);

    for (const prop of fieldProps.results) {
      if (prop.archived || prop.createdUserId === null) continue;
      if (prop.hubspotDefined) continue;

      if (stagingPropertiesNames.includes(prop.name)) {
        await updatePropertySTAGING(prop, objectType);
      } else {
        await addPropertySTAGING(prop, objectType);
      }
    }
  } else {
    console.log(`Skipping properties sync for ${objectType.toUpperCase()}`);
  }

  /* --- Pipelines --- */

  // Check if sync of pipelines is enabled
  if (SYNC_ENABLED.pipelines) {
    console.log(`Syncing pipelines for ${objectType.toUpperCase()}`);

    // Fetch pipelines from source portal to developer portal
    const pipelines = await getPipelines(objectType);
    const stagingPipelines = await getPipelinesSTAGING(objectType);

    for (const pipeline of pipelines.results) {
      console.log(`Processing pipeline ${pipeline.id}...`);

      // Sync only default pipeline for each objectType
      if (objectType === "deals" && pipeline.id !== "default") continue;
      if (objectType === "contacts" && pipeline.id !== "contacts-lifecycle-pipeline") continue;
      if (objectType === "companies" && pipeline.id !== "companies-lifecycle-pipeline") continue;
      
      if (pipeline.archived) continue;

      // Sync pipeline
      if (stagingPipelines.includes(pipeline.id)) {
        await updatePipelineSTAGING(pipeline, objectType);
      } else {
        await addPipelineSTAGING(pipeline, objectType);
      }

      // Sync stages
      const stages = await getPipelineStages(pipeline, objectType);
      const stagingStages = await getPipelineStagesSTAGING(pipeline, objectType);

      // Clean up stages in staging pipeline that do not exist in prod pipeline
      for (const stagingStage of stagingStages.results) {
        const stageExistsInProd = stages.results.some(s => s.id === stagingStage.id);
        if (!stageExistsInProd) {
          // Delete stage
          await deletePipelineStageSTAGING(stagingStage, pipeline, objectType);
        }
      }

      // Create stages
      for (const stage of stages.results) {
        if (stage.archived) continue;

        const stageExistsInStaging = stagingStages.results.some(s => s.id === stage.id);

        if (stageExistsInStaging) {
          await updatePipelineStageSTAGING(stage, pipeline, objectType);
        } else {
          await addPipelineStageSTAGING(stage, pipeline, objectType);
        }
      }
    }
  } else {
    console.log(`Skipping pipelines sync for ${objectType.toUpperCase()}`);
  }
}

async function addPropertySTAGING(prop, objectType) {
  console.log(`${objectType.toUpperCase()} - property ${prop.groupName} DOES NOT EXIST - Creating...`);

  const payloadProperty = {
    ...prop,
    fieldType: mapValidFieldTypeToV3(prop.type, prop.fieldType),
    options: prop.options.length > 0 ? prop.options : [{ label: 'default', value: 'default' }],
  };

  try {
    if (!await isTokenSTAGING(STAGING_TOKEN)) {
      throw new Error('STAGING_TOKEN is not valid for a sandbox/developer account.');
    }

    await axios.post(`https://api.hubapi.com/crm/v3/properties/${objectType}`, payloadProperty, {
      headers: {
        Authorization: `Bearer ${STAGING_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`✅ Successfully created ${objectType} property: ${prop.name}`);
  } catch (err) {
    console.error(`❌ Failed to create ${objectType} property: ${prop.name}, STATUS: ${err.response ? err.response.status : 'UNKNOWN'}`, err.response ? err.response.data : err.message);
  }
}

async function addPropertyGroupSTAGING(group, objectType) {
  console.log(`${objectType.toUpperCase()} - property group ${group.name} DOES NOT EXIST - Creating...`);
  const payloadGroup = {
    ...group,
  };
  try {
    if (!await isTokenSTAGING(STAGING_TOKEN)) {
      throw new Error('STAGING_TOKEN is not valid for a sandbox/developer account.');
    }

    await axios.post(`https://api.hubapi.com/crm/v3/properties/${objectType}/groups`, payloadGroup, {
      headers: {
        Authorization: `Bearer ${STAGING_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`✅ Successfully created ${objectType} property group: ${group.name}`);
  } catch (err) {
    console.error(`❌ Failed to create ${objectType} field group: ${group.name}, STATUS: ${err.response ? err.response.status : 'UNKNOWN'}`, err.response ? err.response.data : err.message);
  }
}

async function updatePropertyGroupSTAGING(group, objectType) {
  console.log(`${objectType.toUpperCase()} - property group ${group.name} EXISTS - Updating...`);

  const payloadGroup = {
    ...group,
  };

  try {
    if (!await isTokenSTAGING(STAGING_TOKEN)) {
      throw new Error('STAGING_TOKEN is not valid for a sandbox/developer account.');
    }

    await axios.patch(`https://api.hubapi.com/crm/v3/properties/${objectType}/groups/${group.name}`, payloadGroup, {
      headers: {
        Authorization: `Bearer ${STAGING_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`✅ Successfully updated ${objectType} property group: ${group.name}`);
  } catch (err) {
    console.error(`❌ Failed to update ${objectType} field group: ${group.name}, STATUS: ${err.response ? err.response.status : 'UNKNOWN'}`, err.response ? err.response.data : err.message);
  }
}

async function updatePropertySTAGING(prop, objectType) {
  console.log(`${objectType.toUpperCase()} - property ${prop.name} EXISTS - Updating...`);

  const payloadProperty = {
    ...prop,
    fieldType: mapValidFieldTypeToV3(prop.type, prop.fieldType),
    ...(prop.options.length > 0 && { options: prop.options }),
  };

  try {
    if (!await isTokenSTAGING(STAGING_TOKEN)) {
      throw new Error('STAGING_TOKEN is not valid for a sandbox/developer account.');
    }

    await axios.patch(`https://api.hubapi.com/crm/v3/properties/${objectType}/${prop.name}`, payloadProperty, {
      headers: {
        Authorization: `Bearer ${STAGING_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`✅ Successfully updated ${objectType} property: ${prop.name}`);
  } catch (err) {
    console.error(`❌ Failed to update ${objectType} property: ${prop.name}, STATUS: ${err.response ? err.response.status : 'UNKNOWN'}`, err.response ? err.response.data : err.message);
  }
}

async function getGroupsPROD(objectType) {
  const response = await axios.get(`https://api.hubapi.com/crm/v3/properties/${objectType}/groups`, {
    headers: { Authorization: `Bearer ${PROD_TOKEN}` }
  });
  return response.data;
}

async function getGroupsNamesSTAGING(objectType) {
  const response = await axios.get(`https://api.hubapi.com/crm/v3/properties/${objectType}/groups`, {
    headers: { Authorization: `Bearer ${STAGING_TOKEN}` }
  });
  return response.data.results.map((group) => group.name);
}

async function getPropertiesNamesSTAGING(objectType) {
  const response = await axios.get(`https://api.hubapi.com/crm/v3/properties/${objectType}`, {
    headers: { Authorization: `Bearer ${STAGING_TOKEN}` }
  });
  return response.data.results.map((property) => property.name);
}

async function getProperties(objectType) {
  const response = await axios.get(`https://api.hubapi.com/crm/v3/properties/${objectType}`, {
    headers: { Authorization: `Bearer ${PROD_TOKEN}` }
  });
  return response.data;
}

async function getPipelines(objectType) {
  const response = await axios.get(`https://api.hubapi.com/crm/v3/pipelines/${objectType}`, {
    headers: { Authorization: `Bearer ${PROD_TOKEN}` }
  });
  return response.data;
}

async function getPipelinesSTAGING(objectType) {
  const response = await axios.get(`https://api.hubapi.com/crm/v3/pipelines/${objectType}`, {
    headers: { Authorization: `Bearer ${STAGING_TOKEN}` }
  });
  return response.data.results.map((pipeline) => pipeline.id);
}

async function updatePipelineSTAGING(pipeline, objectType) {
  console.log(`${objectType.toUpperCase()} - pipeline ${pipeline.id} EXISTS - Updating...`);

  const payloadPipeline = {
    displayOrder: pipeline.displayOrder,
    label: pipeline.label,
  };

  try {
    if (!await isTokenSTAGING(STAGING_TOKEN)) {
      throw new Error('STAGING_TOKEN is not valid for a sandbox/developer account.');
    }

    await axios.patch(`https://api.hubapi.com/crm/v3/pipelines/${objectType}/${pipeline.id}`, payloadPipeline, {
      headers: {
        Authorization: `Bearer ${STAGING_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    console.log(`✅ Successfully updated ${objectType} pipeline: ${pipeline.id}`);
  } catch (err) {
    console.error(`❌ Failed to update ${objectType} pipeline: ${pipeline.id}, STATUS: ${err.response ? err.response.status : 'UNKNOWN'}`, err.response ? err.response.data : err.message);
  }
}

async function addPipelineSTAGING(pipeline, objectType) {
  console.log(`${objectType.toUpperCase()} - pipeline ${pipeline.id} DOES NOT EXIST - Creating...`);

  const payloadPipeline = {
    displayOrder: pipeline.displayOrder,
    label: pipeline.label,
    stages: [
      // Default stage to avoid empty stages error
      {
        label: 'Default Stage',
        displayOrder: 0,
        metadata: {
          // Insert required metadata based on object type
          ...(objectType === 'deals' ? { probability: 0.0 } : {}),
          ...(objectType === 'tickets' ? { ticketState: "OPEN" } : {}),
        }
      }
    ],
  };

  try {
    if (!await isTokenSTAGING(STAGING_TOKEN)) {
      throw new Error('STAGING_TOKEN is not valid for a sandbox/developer account.');
    }

    await axios.post(`https://api.hubapi.com/crm/v3/pipelines/${objectType}`, payloadPipeline, {
      headers: {
        Authorization: `Bearer ${STAGING_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    console.log(`✅ Successfully created pipeline ${pipeline.id} in ${objectType.toUpperCase()} with a default stage. Please update stages accordingly.`);
  } catch (err) {
    console.error(`❌ Failed to create ${objectType} pipeline: ${pipeline.id}, STATUS: ${err.response ? err.response.status : 'UNKNOWN'}`, err.response ? err.response.data : err.message);
  }
}

async function getPipelineStages(pipeline, objectType) {
  const response = await axios.get(`https://api.hubapi.com/crm/v3/pipelines/${objectType}/${pipeline.id}/stages`, {
    headers: { Authorization: `Bearer ${PROD_TOKEN}` }
  });
  return response.data;
}

async function getPipelineStagesSTAGING(pipeline, objectType) {
  const response = await axios.get(`https://api.hubapi.com/crm/v3/pipelines/${objectType}/${pipeline.id}/stages`, {
    headers: { Authorization: `Bearer ${STAGING_TOKEN}` }
  });
  return response.data;
}

async function addPipelineStageSTAGING(stage, pipeline, objectType) {
  console.log(`${objectType.toUpperCase()} - pipeline ${pipeline.id} stage ${stage.id} DOES NOT EXIST - Creating...`);

  const payloadStage = {
    metadata: stage.metadata,
    displayOrder: stage.displayOrder,
    label: stage.label,
  };

  try {
    if (!await isTokenSTAGING(STAGING_TOKEN)) {
      throw new Error('STAGING_TOKEN is not valid for a sandbox/developer account.');
    }

    await axios.post(`https://api.hubapi.com/crm/v3/pipelines/${objectType}/${pipeline.id}/stages`, payloadStage, {
      headers: {
        Authorization: `Bearer ${STAGING_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`✅ Successfully created ${objectType} pipeline ${pipeline.id} stage: ${stage.id}`);
  } catch (err) {
    console.error(`❌ Failed to create ${objectType} pipeline ${pipeline.id} stage: ${stage.id}, STATUS: ${err.response ? err.response.status : 'UNKNOWN'}`, err.response ? err.response.data : err.message);
  }
}

async function updatePipelineStageSTAGING(stage, pipeline, objectType) {
  console.log(`${objectType.toUpperCase()} - pipeline ${pipeline.id} stage ${stage.id} EXISTS - Updating...`);

  const payloadStage = {
    metadata: stage.metadata,
    displayOrder: stage.displayOrder,
    label: stage.label,
  };

  try {
    if (!await isTokenSTAGING(STAGING_TOKEN)) {
      throw new Error('STAGING_TOKEN is not valid for a sandbox/developer account.');
    }

    await axios.patch(`https://api.hubapi.com/crm/v3/pipelines/${objectType}/${pipeline.id}/stages/${stage.id}`, payloadStage, {
      headers: {
        Authorization: `Bearer ${STAGING_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`✅ Successfully updated ${objectType} pipeline ${pipeline.id} stage: ${stage.id}`);
  } catch (err) {
    console.error(`❌ Failed to update ${objectType} pipeline ${pipeline.id} stage: ${stage.id}, STATUS: ${err.response ? err.response.status : 'UNKNOWN'}`, err.response ? err.response.data : err.message);
  }
}

async function deletePipelineStageSTAGING(stage, pipeline, objectType) {
  console.log(`${objectType.toUpperCase()} - pipeline ${pipeline.id} stage ${stage.id} NOT USED - Deleting...`);
  
  try {
    if (!await isTokenSTAGING(STAGING_TOKEN)) {
      throw new Error('STAGING_TOKEN is not valid for a sandbox/developer account.');
    }

    await axios.delete(`https://api.hubapi.com/crm/v3/pipelines/${objectType}/${pipeline.id}/stages/${stage.id}`, {
      headers: {
        Authorization: `Bearer ${STAGING_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    console.log(`✅ Successfully deleted ${objectType} pipeline ${pipeline.id} stage: ${stage.id}`);
  } catch (err) {
    console.error(`❌ Failed to delete ${objectType} pipeline ${pipeline.id} stage: ${stage.id}, STATUS: ${err.response ? err.response.status : 'UNKNOWN'}`, err.response ? err.response.data : err.message);
  }
}

function mapValidFieldTypeToV3(type, fieldType) {
  // Map field types to valid HubSpot v3 field types
  const fieldTypeMap = {
    'date': 'date',
    'datetime': 'date',
    'object_coordinates': 'text',
    'json': 'text',
    'number': 'number',
    'string': 'text',
    'bool': 'booleancheckbox',
    'enumeration': ['booleancheckbox', 'radio', 'select', 'checkbox', 'calculation_equation'].includes(fieldType) ? fieldType : 'checkbox',
  };

  if (!fieldTypeMap[type]) {
    return 'text';
  }

  return fieldTypeMap[type];
}

async function checkTokens() {
  // Check the "accountType" property to determine if the token is correct
  // accountType = "STANDARD" | "DEVELOPER_TEST" | "SANDBOX" | "APP_DEVELOPER" (STANDARD indicates a production account)

  const checkTokenProd = await axios.get(`https://api.hubapi.com/account-info/v3/details`, {
    headers: { Authorization: `Bearer ${PROD_TOKEN}` }
  }).catch(err => {
    console.error('Failed to validate PROD_TOKEN', err.response ? err.response.data : err.message);
    throw new Error('Failed to validate PROD_TOKEN');
  });

  if (!checkTokenProd.status === 200 || !checkTokenProd.data.accountType || checkTokenProd.data.accountType !== 'STANDARD') {
    console.error('The PROD_TOKEN does not belong to a production account', checkTokenProd.data.accountType);
    throw new Error('The PROD_TOKEN does not belong to a production account');
  }

  const checkTokenStaging = await axios.get(`https://api.hubapi.com/account-info/v3/details`, {
    headers: { Authorization: `Bearer ${STAGING_TOKEN}` }
  }).catch(err => {
    console.error('Failed to validate STAGING_TOKEN', err.response ? err.response.data : err.message);
    throw new Error('Failed to validate STAGING_TOKEN');
  });

  if (
    !checkTokenStaging.status === 200 ||
    !checkTokenStaging.data.accountType ||
    (
      checkTokenStaging.data.accountType !== 'DEVELOPER_TEST'
      && checkTokenStaging.data.accountType !== 'SANDBOX'
      && checkTokenStaging.data.accountType !== 'APP_DEVELOPER'
    )
  ) {
    console.error('The STAGING_TOKEN does not belong to a sandbox account', checkTokenStaging.data.accountType);
    throw new Error('The STAGING_TOKEN does not belong to a sandbox account.');
  }
}

async function isTokenSTAGING(token) {
  const response = await axios.get(`https://api.hubapi.com/account-info/v3/details`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data.accountType !== 'STANDARD';
}

async function main() {
  console.log('Syncing process starting...');
  for (const objectType of OBJECTS) {
    console.log(`🛠️ Syncing ${objectType.toUpperCase()}`);
    await cloneProperties(objectType);
  }
}

main()
  .then(() => console.log('Syncing process completed.'))
  .catch(err => console.error('Error in syncing process:', err));