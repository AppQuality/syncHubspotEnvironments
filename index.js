const axios = require('axios');

const { PROD_TOKEN, STAGING_TOKEN } = require('./constants');

const OBJECTS = ['contacts', 'companies', 'deals'];

async function cloneProperties(objectType) {
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

  // Fetch field groups for the entity
  const fieldGroups = await axios.get(`https://api.hubapi.com/crm/v3/properties/${objectType}/groups`, {
    headers: { Authorization: `Bearer ${PROD_TOKEN}` }
  });

  for (const group of fieldGroups.data.results) {
    // Skip default groups
    if (group.default) continue;
    const payloadGroup = {
       name: group.name,
       label: group.label,
       displayOrder: group.displayOrder,
       archived: false
    };

    try {
      console.log(`${objectType.toUpperCase()} - Field group: ${group.name}`);
      // await axios.post(`https://api.hubapi.com/crm/v3/properties/${objectType}/groups`, payloadGroup, {
      //   headers: {
      //     Authorization: `Bearer ${STAGING_TOKEN}`,
      //     'Content-Type': 'application/json'
      //   }
      // });
    } catch (err) {
      // check if error is 4XX
       if (err.response && err.response.status >= 400 && err.response.status < 500) {
        //TODO if error is 409 (conflict prop exist - probably is hubspot default prop)  update groupName, description etc as on production
        //console.log(`⚠️ Field group already exists: ${group.name}`);
        continue;
      } else {
          console.error(`❌ Failed to create ${objectType} field group: ${group.name}, STATUS: ${err.response ? err.response.status : 'UNKNOWN'}`, err.response ? err.response.data : err.message);

      }
    }
  }

  // Fetch properties from source portal
  const sourceProps = await axios.get(`https://api.hubapi.com/crm/v3/properties/${objectType}`, {
    headers: { Authorization: `Bearer ${PROD_TOKEN}` }
  });

  for (const prop of sourceProps.data.results) {
    // Skip default properties
    if (prop.archived || prop.createdUserId === null) continue;
    // if prop.name start with hs_ skip it
    if (prop.name.startsWith('hs_')) continue;

    const payloadEntity = {
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
      console.log(`${objectType.toUpperCase()} - Property: ${prop.name}`);
      await axios.post(`https://api.hubapi.com/crm/v3/properties/${objectType}`, payloadEntity, {
        headers: {
          Authorization: `Bearer ${STAGING_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
    } catch (err) {
      // check if error is 4XX
      if (err.response && err.response.status >= 400 && err.response.status < 500) {
        if (err.response.status === 400) {
          console.log(`${objectType} property already exists: ${prop.name}`);
          // console log the error
          console.log(`STATUS: ${err.response.status}`, err.response.data, payloadEntity);
          // debug
          return;
        }else{
          // console.log(`⚠️${objectType} property ${prop.name} - STATUS: ${err.response.status}`, err.response.data, payloadEntity);
        continue;
        }
      }
      else {
        console.error(`❌ Failed to create ${objectType} property: ${prop.name}, STATUS: ${err.response ? err.response.status : 'UNKNOWN'}`, err.response ? err.response.data : err.message);
      }
    }
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
    'enumeration': ['booleancheckbox','radio', 'select', 'checkbox', 'calculation_equation'].includes(fieldType) ? fieldType : 'checkbox',
  };
  if (!fieldTypeMap[type]) {
    return 'text';
  }
  return fieldTypeMap[type];
}

async function main() {
  console.log('Cloning process starting...');
  for (const objectType of OBJECTS) {
    console.log(`Cloning properties for: ${objectType}`);
    await cloneProperties(objectType);
  }
}

main()
  .then(() => console.log('Cloning process completed.'))
  .catch(err => console.error('Error in cloning process:', err));