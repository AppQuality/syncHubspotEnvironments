const axios = require('axios');

const { PROD_TOKEN, STAGING_TOKEN } = require('./constants');

const OBJECTS = ['contacts', 'companies', 'deals'];

async function cloneProperties(objectType) {
 
  await checkTokens();

  // Fetch groups from source portal to developer portal
  const fieldPropsGroups = await getGroupsPROD(objectType);
  const stagingGroupsNames = await getGroupsNamesSTAGE(objectType);

  for (const group of fieldPropsGroups.results) {
    // Skip default groups
    if (group.default) continue;

    if (stagingGroupsNames.includes(group.name)) {
      await updatePropertyGroupSTAGE(group,objectType);
    } else {
      await addPropertyGroupSTAGE(objectType, group);
    }
  }

  // Fetch properties from source portal to developer portal
  const fieldProps = await getProperties(objectType);
  const stagingPropertiesNames = await getPropertiesNamesSTAGE(objectType);

  for (const prop of fieldProps.results) {
    if (prop.archived || prop.createdUserId === null) continue;
    if (prop.name.startsWith('hs_')) continue;
    if (prop.hubspotDefined) continue;

    if (stagingPropertiesNames.includes(prop.name)) {
      await updatePropertySTAGE(prop, objectType);
    } else {
      await addPropertySTAGE(prop, objectType);
    }
  }
}

async function addPropertySTAGE(prop, objectType) {
  console.log(`${objectType.toUpperCase()} - property ${prop.groupName} DOES NOT EXIST - Creating...`);

      const payloadProperty = {
      name: prop.name,
      label: prop.label,
      type: prop.type,
      fieldType: mapValidFieldTypeToV3(prop.type, prop.fieldType),
      groupName: prop.groupName,
      options: prop.options.length > 0 ? prop.options : [ { label: 'default', value: 'default' } ],
      description: prop.description || '',
      displayOrder: prop.displayOrder || 1,
      hidden: false,
      formField: prop.formField || false
    };
    try {
       await axios.post(`https://api.hubapi.com/crm/v3/properties/${objectType}`, payloadProperty, {
        headers: {
          Authorization: `Bearer ${STAGING_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
    } catch (err) {
        console.error(`❌ Failed to create ${objectType} property: ${prop.name}, STATUS: ${err.response ? err.response.status : 'UNKNOWN'}`, err.response ? err.response.data : err.message);
    }
}

async function addPropertyGroupSTAGE(group, objectType) {
      console.log(`${objectType.toUpperCase()} - property group ${group.name} DOES NOT EXIST - Creating...`);
      const payloadGroup = {
       name: group.name,
       label: group.label,
       displayOrder: group.displayOrder,
       archived: false
    };
    try {
       await axios.post(`https://api.hubapi.com/crm/v3/properties/${objectType}/groups`, payloadGroup, {
        headers: {
          Authorization: `Bearer ${STAGING_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
    } catch (err) {
       if (err.response && err.response.status >= 400 && err.response.status < 500) {
        //TODO if error is 409 (conflict prop exist - probably is hubspot default prop)  update groupName, description etc as on production
      } else {
          console.error(`❌ Failed to create ${objectType} field group: ${group.name}, STATUS: ${err.response ? err.response.status : 'UNKNOWN'}`, err.response ? err.response.data : err.message);
      }
    }
}


async function updatePropertyGroupSTAGE(group, objectType) {
      console.log(`${objectType.toUpperCase()} - property group ${group.name} EXISTS - Updating...`);
      const payloadGroup = {
       label: group.label,
       displayOrder: group.displayOrder
    };
    try {
       await axios.patch(`https://api.hubapi.com/crm/v3/properties/${objectType}/groups/${group.name}`, payloadGroup, {
        headers: {
          Authorization: `Bearer ${STAGING_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
    } catch (err) {
       console.error(`❌ Failed to update ${objectType} field group: ${group.name}, STATUS: ${err.response ? err.response.status : 'UNKNOWN'}`, err.response ? err.response.data : err.message);
    }
}

async function updatePropertySTAGE(prop, objectType) {
      console.log(`${objectType.toUpperCase()} - property ${prop.name} EXISTS - Updating...`);
     const payloadProperty = {
      name: prop.name,
      label: prop.label,
      type: prop.type,
      fieldType: mapValidFieldTypeToV3(prop.type, prop.fieldType),
      groupName: prop.groupName,
      ...prop.options.length > 0 && { options:  prop.options },
      description: prop.description || '',
      displayOrder: prop.displayOrder || 1,
      formField: prop.formField || false
    };
    try {
       await axios.patch(`https://api.hubapi.com/crm/v3/properties/${objectType}/${prop.name}`, payloadProperty, {
        headers: {
          Authorization: `Bearer ${STAGING_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
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

async function getGroupsNamesSTAGE(objectType) {
  const response = await axios.get(`https://api.hubapi.com/crm/v3/properties/${objectType}/groups`, {
    headers: { Authorization: `Bearer ${STAGING_TOKEN}` }
  });
  return response.data.results.map((group)=> group.name);
}

async function getPropertiesNamesSTAGE(objectType) {
  const response = await axios.get(`https://api.hubapi.com/crm/v3/properties/${objectType}`, {
    headers: { Authorization: `Bearer ${STAGING_TOKEN}` }
  });
  return response.data.results.map((property)=> property.name);
}

async function getProperties(objectType) {
  const response = await axios.get(`https://api.hubapi.com/crm/v3/properties/${objectType}`, {
    headers: { Authorization: `Bearer ${PROD_TOKEN}` }
  });
  return response.data;
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
    'enumeration': ['booleancheckbox','radio', 'select', 'checkbox', 'calculation_equation'].includes(fieldType) ? fieldType : 'checkbox',
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
    throw new Error('The PROD_TOKEN does not belong to a production account.');
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
    throw new Error('The STAGING_TOKEN does not belong to a sandbox account.');
  }
}

async function main() {
  console.log('Syncing process starting...');
  for (const objectType of OBJECTS) {
    console.log(`Syncing properties for: ${objectType.toUpperCase()}`);
    await cloneProperties(objectType);
  }
}

main()
  .then(() => console.log('Syncing process completed.'))
  .catch(err => console.error('Error in syncing process:', err));