# syncHubspot

Synchronize data with HubSpot using Node.js.

## Overview

This utility provides functions to interact with the HubSpot API, enabling synchronization of contacts and companies from your local data sources.

Sync structure for Contacts, Companies, Deals from a STANDARD Environment to a DEVELOPER Environment on Hubspot

## Features

- Sync contacts and companies to HubSpot
- Handles API authentication via environment variables
- Error handling and logging

## Usage

1. **Install dependencies:**
    ```bash
    npm install
    yarn
    ```

2. **Set environment variables:**
    Rename the file constants.template.js to constants.template.js and fill: 
    - `PROD_TOKEN` – Your HubSpot Token for a STANDARD Environment
    - `STAGING_TOKEN` – Your HubSpot Token for a developer Environment 

3. **Run the script:**
    ```bash
    node index.js
    yarn start
    ```

## Configuration

Edit `index.js` to customize which data is synchronized and how records are mapped.
